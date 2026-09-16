import 'package:dio/dio.dart';

import '../../data/models/json.dart';

/// API error with the backend's stable error code (see backend ErrorEnvelope). Only messages that came from the
/// server's error envelope are shown to the user as-is; local failures (no connection, proxy errors) get l10n texts
/// via `apiErrorText`.
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.status, this.details, this.fromServer = false});

  factory ApiException.fromDio(DioException error) {
    final status = error.response?.statusCode;
    final data = error.response?.data;
    if (data is Map<String, Object?>) {
      final envelope = data.object('error');
      final message = envelope?.str('message') ?? '';
      if (envelope != null && message.isNotEmpty) {
        return ApiException(envelope.str('code', 'INTERNAL_ERROR'), message,
            status: status, details: envelope['details'], fromServer: true);
      }
    }
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        const ApiException('NETWORK', 'server unreachable'),
      DioExceptionType.cancel => const ApiException('CANCELLED', 'cancelled'),
      // 502/503/504 from the reverse proxy while the API restarts count as "cannot reach the server".
      _ when const [502, 503, 504].contains(status) => ApiException('NETWORK', 'gateway $status', status: status),
      _ => ApiException('HTTP_${status ?? 0}', error.message ?? 'request failed', status: status),
    };
  }

  final String code;
  final String message;
  final int? status;
  final Object? details;

  /// true when [message] is the server's user-facing (Turkish) text.
  final bool fromServer;

  bool get isNetwork => code == 'NETWORK';
  bool get isUnauthorized => code == 'UNAUTHORIZED' || status == 401;

  /// The server's message, or null when the UI should use its own l10n text.
  String? get serverMessage => fromServer ? message : null;

  @override
  String toString() => 'ApiException($code, $message)';
}
