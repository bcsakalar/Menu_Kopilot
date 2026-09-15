import 'package:dio/dio.dart';

import '../../data/models/json.dart';

/// API error with the backend's stable error code (see backend ErrorEnvelope).
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.status, this.details});

  factory ApiException.fromDio(DioException error) {
    final data = error.response?.data;
    if (data is Map<String, Object?>) {
      final envelope = data.object('error');
      if (envelope != null) {
        return ApiException(
          envelope.str('code', 'INTERNAL_ERROR'),
          envelope.str('message', 'Beklenmeyen bir hata oluştu'),
          status: error.response?.statusCode,
          details: envelope['details'],
        );
      }
    }
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        const ApiException('NETWORK', 'Sunucuya ulaşılamadı'),
      DioExceptionType.cancel => const ApiException('CANCELLED', 'İptal edildi'),
      _ => ApiException('HTTP_${error.response?.statusCode ?? 0}', error.message ?? 'İstek başarısız',
          status: error.response?.statusCode),
    };
  }

  final String code;
  final String message;
  final int? status;
  final Object? details;

  bool get isNetwork => code == 'NETWORK';
  bool get isUnauthorized => code == 'UNAUTHORIZED' || status == 401;

  @override
  String toString() => 'ApiException($code, $message)';
}
