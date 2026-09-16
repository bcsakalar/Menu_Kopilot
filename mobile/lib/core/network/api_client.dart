import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../../data/models/branch.dart';
import '../../data/models/common.dart';
import '../../data/models/gap.dart';
import '../../data/models/json.dart';
import '../../data/models/settings.dart';
import '../../data/models/suggestion.dart';
import '../../data/models/template_item.dart';
import '../../data/models/template_payload.dart';
import '../../data/models/voice_research.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';
import 'sse.dart';

class UploadImage {
  const UploadImage({required this.path, required this.sha256});
  final String path;
  final String sha256;
}

class SuggestRequestData {
  const SuggestRequestData({
    required this.cuisineId,
    this.promptText = '',
    this.branchId,
    this.deepMode = false,
    this.images = const [],
  });

  final String cuisineId;
  final String promptText;
  final String? branchId;
  final bool deepMode;
  final List<UploadImage> images;

  Json toJson() => {
        'cuisineId': cuisineId,
        'promptText': promptText,
        'branchId': branchId,
        'deepMode': deepMode,
        'images': images.map((i) => {'path': i.path, 'sha256': i.sha256}).toList(),
      };

  static SuggestRequestData fromJson(Json json) => SuggestRequestData(
        cuisineId: json.str('cuisineId'),
        promptText: json.str('promptText'),
        branchId: json.strOrNull('branchId'),
        deepMode: json.boolean('deepMode'),
        images: json.objects('images').map((i) => UploadImage(path: i.str('path'), sha256: i.str('sha256'))).toList(),
      );
}

/// Typed access to the Menü Kopilot API. Tokens are attached automatically and refreshed once on 401;
/// idempotent GETs are retried on network errors. Provider keys never exist on the device.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokens,
    this.onSessionExpired,
    HttpClientAdapter? adapter,
  }) {
    final options = BaseOptions(
      baseUrl: _normalizeBase(baseUrl),
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 60),
      responseType: ResponseType.json,
    );
    _dio = Dio(options);
    _refreshDio = Dio(options);
    if (adapter != null) {
      _dio.httpClientAdapter = adapter;
      _refreshDio.httpClientAdapter = adapter;
    }
    _dio.interceptors.add(QueuedInterceptorsWrapper(onRequest: _attachToken, onError: _handleAuthError));
    _dio.interceptors.add(InterceptorsWrapper(onError: _retryIdempotent));
  }

  final TokenStore tokens;
  final void Function()? onSessionExpired;
  late final Dio _dio;
  late final Dio _refreshDio;

  static String _normalizeBase(String base) {
    final trimmed = base.trim().replaceAll(RegExp(r'/+$'), '');
    return trimmed.endsWith('/api/v1') ? trimmed : '$trimmed/api/v1';
  }

  Future<void> _attachToken(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!options.path.startsWith('/auth/login') && !options.path.startsWith('/auth/refresh')) {
      final session = await tokens.read();
      if (session != null) options.headers['authorization'] = 'Bearer ${session.accessToken}';
    }
    handler.next(options);
  }

  Future<void> _handleAuthError(DioException error, ErrorInterceptorHandler handler) async {
    final path = error.requestOptions.path;
    final retried = error.requestOptions.extra['auth_retry'] == true;
    if (error.response?.statusCode != 401 || retried || path.startsWith('/auth/')) {
      handler.next(error);
      return;
    }
    final session = await tokens.read();
    if (session == null) {
      handler.next(error);
      return;
    }
    try {
      final response = await _refreshDio.post<Json>('/auth/refresh', data: {'refreshToken': session.refreshToken});
      final refreshed = AuthSession.fromJson(response.data ?? const {});
      await tokens.write(refreshed);
      final request = error.requestOptions
        ..extra['auth_retry'] = true
        ..headers['authorization'] = 'Bearer ${refreshed.accessToken}';
      handler.resolve(await _dio.fetch<Object?>(request));
    } on DioException {
      await tokens.clear();
      onSessionExpired?.call();
      handler.next(error);
    }
  }

  Future<void> _retryIdempotent(DioException error, ErrorInterceptorHandler handler) async {
    final request = error.requestOptions;
    final attempt = (request.extra['retry_attempt'] as int?) ?? 0;
    final network = error.type == DioExceptionType.connectionError || error.type == DioExceptionType.connectionTimeout;
    final server = (error.response?.statusCode ?? 0) >= 500;
    if (request.method != 'GET' || attempt >= 2 || !(network || server)) {
      handler.next(error);
      return;
    }
    await Future<void>.delayed(Duration(milliseconds: 500 * (attempt + 1) * (attempt + 1)));
    request.extra['retry_attempt'] = attempt + 1;
    try {
      handler.resolve(await _dio.fetch<Object?>(request));
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  Future<T> _guard<T>(Future<T> Function() body) async {
    try {
      return await body();
    } on DioException catch (e) {
      throw await _toApiException(e);
    }
  }

  Future<ApiException> _toApiException(DioException error) async {
    final data = error.response?.data;
    if (data is ResponseBody) {
      // Streamed request that failed before SSE started: read the JSON error envelope.
      try {
        final text = await utf8.decoder.bind(data.stream.cast<List<int>>()).join();
        final decoded = asJson(jsonDecode(text));
        final envelope = decoded.object('error');
        final message = envelope?.str('message') ?? '';
        if (envelope != null && message.isNotEmpty) {
          return ApiException(envelope.str('code', 'INTERNAL_ERROR'), message,
              status: error.response?.statusCode, details: envelope['details'], fromServer: true);
        }
      } on Object {
        // fall through
      }
    }
    return ApiException.fromDio(error);
  }

  // ---- auth -------------------------------------------------------------------------------------------------

  Future<AuthSession> login(String email, String password, String deviceName) => _guard(() async {
        final response = await _dio.post<Json>(
          '/auth/login',
          data: {'email': email, 'password': password, 'deviceName': deviceName},
        );
        return AuthSession.fromJson(response.data ?? const {});
      });

  Future<void> logout() => _guard(() async {
        await _dio.post<Object?>('/auth/logout');
      });

  Future<AuthUser> me() => _guard(() async {
        final response = await _dio.get<Json>('/auth/me');
        return AuthUser.fromJson(response.data ?? const {});
      });

  /// Readiness of the server (database + redis); used by the settings screen to test the URL.
  Future<Json> health() => _guard(() async {
        final root = _dio.options.baseUrl.replaceAll(RegExp(r'/api/v1$'), '');
        final response = await _refreshDio.get<Json>('$root/health/ready');
        return response.data ?? const {};
      });

  // ---- cuisines ---------------------------------------------------------------------------------------------

  Future<List<Cuisine>> cuisines() => _guard(() async {
        final response = await _dio.get<Json>('/cuisines');
        return (response.data ?? const {}).objects('data').map(Cuisine.fromJson).toList();
      });

  // ---- suggestions ------------------------------------------------------------------------------------------

  Future<FormData> _form(SuggestRequestData request) async => FormData.fromMap({
        'cuisineId': request.cuisineId,
        if (request.promptText.trim().isNotEmpty) 'promptText': request.promptText,
        if (request.branchId != null) 'branchId': request.branchId,
        'deepMode': request.deepMode.toString(),
        'images': [
          for (final image in request.images)
            await MultipartFile.fromFile(image.path, filename: '${image.sha256}.jpg', contentType: DioMediaType('image', 'jpeg')),
        ],
      });

  Stream<SuggestEvent> _sse(Future<Response<ResponseBody>> Function() open) async* {
    final Response<ResponseBody> response;
    try {
      response = await open();
    } on DioException catch (e) {
      throw await _toApiException(e);
    }
    final body = response.data;
    if (body == null) return;
    final parser = SseParser();
    try {
      await for (final chunk in utf8.decoder.bind(body.stream.cast<List<int>>())) {
        for (final message in parser.add(chunk)) {
          final event = SuggestEvent.fromSse(message.event, message.data);
          if (event != null) yield event;
        }
      }
    } on DioException catch (e) {
      throw await _toApiException(e);
    }
  }

  Options get _sseOptions => Options(
        responseType: ResponseType.stream,
        headers: {'accept': 'text/event-stream'},
        receiveTimeout: const Duration(seconds: 90),
      );

  Stream<SuggestEvent> suggestStream(SuggestRequestData request, {CancelToken? cancelToken}) => _sse(
        () async => _dio.post<ResponseBody>(
          '/suggest',
          data: await _form(request),
          options: _sseOptions,
          cancelToken: cancelToken,
        ),
      );

  Future<String> suggestAsync(SuggestRequestData request) => _guard(() async {
        final response = await _dio.post<Json>('/suggest', queryParameters: {'async': '1'}, data: await _form(request));
        return (response.data ?? const {}).str('runId');
      });

  Stream<SuggestEvent> continueStream(String runId, List<UploadImage> images, {CancelToken? cancelToken}) => _sse(
        () async => _dio.post<ResponseBody>(
          '/suggest/$runId/continue',
          data: FormData.fromMap({
            'images': [
              for (final image in images)
                await MultipartFile.fromFile(image.path, filename: '${image.sha256}.jpg', contentType: DioMediaType('image', 'jpeg')),
            ],
          }),
          options: _sseOptions,
          cancelToken: cancelToken,
        ),
      );

  Stream<SuggestEvent> runEvents(String runId, {CancelToken? cancelToken}) => _sse(
        () => _dio.get<ResponseBody>('/suggest/$runId/events', options: _sseOptions, cancelToken: cancelToken),
      );

  Future<RunSnapshot> run(String runId) => _guard(() async {
        final response = await _dio.get<Json>('/suggest/$runId');
        return RunSnapshot.fromJson(response.data ?? const {});
      });

  Future<bool> cancelRun(String runId) => _guard(() async {
        final response = await _dio.post<Json>('/suggest/$runId/cancel');
        return (response.data ?? const {}).boolean('cancelled');
      });

  Future<({SuggestionCard card, String templateId})> accept(
    String itemId, {
    TemplatePayload? payload,
    String? branchId,
  }) =>
      _guard(() async {
        final response = await _dio.post<Json>(
          '/suggestion-items/$itemId/accept',
          data: {
            'payload': ?payload?.toJson(),
            'branchId': ?branchId,
          },
        );
        final data = response.data ?? const {};
        return (card: SuggestionCard.fromJson(data.object('card') ?? const {}), templateId: data.str('templateId'));
      });

  Future<SuggestionCard> skip(String itemId) => _guard(() async {
        final response = await _dio.post<Json>('/suggestion-items/$itemId/skip');
        return SuggestionCard.fromJson(response.data ?? const {});
      });

  // ---- branches ---------------------------------------------------------------------------------------------

  Future<List<Branch>> branches() => _guard(() async {
        final response = await _dio.get<Json>('/branches');
        return (response.data ?? const {}).objects('data').map(Branch.fromJson).toList();
      });

  Future<Branch> branch(String id) => _guard(() async {
        final response = await _dio.get<Json>('/branches/$id');
        return Branch.fromJson(response.data ?? const {});
      });

  Future<Branch> createBranch({
    required String name,
    required String cuisineId,
    String? city,
    String? notes,
    int? targetItemCount,
  }) =>
      _guard(() async {
        final response = await _dio.post<Json>(
          '/branches',
          data: {
            'name': name,
            'cuisineId': cuisineId,
            'city': ?city,
            'notes': ?notes,
            'targetItemCount': ?targetItemCount,
          },
        );
        return Branch.fromJson(response.data ?? const {});
      });

  /// Only the given keys are changed; pass `targetItemCount: null` inside [changes] to reset the target.
  Future<Branch> updateBranch(String id, Json changes) => _guard(() async {
        final response = await _dio.patch<Json>('/branches/$id', data: changes);
        return Branch.fromJson(response.data ?? const {});
      });

  Future<void> deleteBranch(String id) => _guard(() async {
        await _dio.delete<Object?>('/branches/$id');
      });

  Future<BranchMenu> branchMenu(String branchId) => _guard(() async {
        final response = await _dio.get<Json>('/branches/$branchId/menu');
        return BranchMenu.fromJson(response.data ?? const {});
      });

  Future<BranchMenu> updateMenuItem(String branchId, String itemId, MenuItemStatus status) => _guard(() async {
        final response = await _dio.patch<Json>('/branches/$branchId/menu/$itemId', data: {'status': status.name});
        return BranchMenu.fromJson(response.data ?? const {});
      });

  Future<void> deleteMenuItem(String branchId, String itemId) => _guard(() async {
        await _dio.delete<Object?>('/branches/$branchId/menu/$itemId');
      });

  /// Branch menu export; the file name comes from the server's Content-Disposition.
  Future<({String fileName, String body})> exportBranch(String branchId, {String format = 'csv'}) => _guard(() async {
        final response = await _dio.get<String>(
          '/branches/$branchId/export',
          queryParameters: {'format': format},
          options: Options(responseType: ResponseType.plain),
        );
        final disposition = response.headers.value('content-disposition') ?? '';
        final match = RegExp('filename="([^"]+)"').firstMatch(disposition);
        return (fileName: match?.group(1) ?? 'menu.$format', body: response.data ?? '');
      });

  // ---- template pool ----------------------------------------------------------------------------------------

  Future<({List<TemplateItem> items, int total})> templates({
    String? query,
    String? cuisineId,
    String? source,
    String approved = 'true',
    String sort = 'usage',
    int limit = 500,
    int offset = 0,
  }) =>
      _guard(() async {
        final response = await _dio.get<Json>(
          '/templates',
          queryParameters: {
            'q': ?query,
            'cuisineId': ?cuisineId,
            'source': ?source,
            'approved': approved,
            'sort': sort,
            'limit': limit,
            'offset': offset,
          },
        );
        final data = response.data ?? const {};
        return (
          items: data.objects('data').map(TemplateItem.fromJson).toList(),
          total: (data.object('meta') ?? const {}).integer('total'),
        );
      });

  Future<TemplateItem> updateTemplate(String id, Json changes) => _guard(() async {
        final response = await _dio.patch<Json>('/templates/$id', data: changes);
        return TemplateItem.fromJson(response.data ?? const {});
      });

  /// Returns true when a seed template was archived instead of deleted.
  Future<bool> deleteTemplate(String id) => _guard(() async {
        final response = await _dio.delete<Json>('/templates/$id');
        return (response.data ?? const {}).boolean('archived');
      });

  // ---- settings, cuisines, usage ----------------------------------------------------------------------------

  Future<ProviderSettings> providerSettings() => _guard(() async {
        final response = await _dio.get<Json>('/settings/providers');
        return ProviderSettings.fromJson(response.data ?? const {});
      });

  Future<ProviderSettings> setPrimaryModel(String taskKey, String model) => _guard(() async {
        final response = await _dio.put<Json>('/settings/providers/$taskKey', data: {'model': model});
        return ProviderSettings.fromJson(response.data ?? const {});
      });

  Future<QuotaInfo> quota() => _guard(() async {
        final response = await _dio.get<Json>('/settings/quota');
        return QuotaInfo.fromJson(response.data ?? const {});
      });

  Future<Cuisine> createCuisine({required String name, required int minItemCount, String? parentId, String? notes}) =>
      _guard(() async {
        final response = await _dio.post<Json>(
          '/cuisines',
          data: {'name': name, 'minItemCount': minItemCount, 'parentId': ?parentId, 'notes': ?notes},
        );
        return Cuisine.fromJson(response.data ?? const {});
      });

  Future<Cuisine> updateCuisine(String id, Json changes) => _guard(() async {
        final response = await _dio.patch<Json>('/cuisines/$id', data: changes);
        return Cuisine.fromJson(response.data ?? const {});
      });

  Future<void> deleteCuisine(String id) => _guard(() async {
        await _dio.delete<Object?>('/cuisines/$id');
      });

  Future<UsageSummary> usageSummary(String range) => _guard(() async {
        final response = await _dio.get<Json>('/usage/summary', queryParameters: {'range': range});
        return UsageSummary.fromJson(response.data ?? const {});
      });

  // ---- voice notes & research (Faz 7) -----------------------------------------------------------------------

  /// Sends a recorded voice note; the server turns it into text + product names (the file is not stored).
  Future<Transcription> transcribe(String path, {String language = 'tr', String? cuisineId}) => _guard(() async {
        final response = await _dio.post<Json>(
          '/transcribe',
          data: FormData.fromMap({
            'language': language,
            'cuisineId': ?cuisineId,
            'audio': await MultipartFile.fromFile(path, filename: 'note.m4a', contentType: DioMediaType('audio', 'mp4')),
          }),
          options: Options(receiveTimeout: const Duration(seconds: 60)),
        );
        return Transcription.fromJson(response.data ?? const {});
      });

  /// Searches the web for the branch's restaurant (slow: web search + reading pages).
  Future<ResearchResult> research({String? branchId, String? restaurantName, String? city, bool refresh = false}) =>
      _guard(() async {
        final response = await _dio.post<Json>(
          '/research',
          data: {'branchId': ?branchId, 'restaurantName': ?restaurantName, 'city': ?city, 'refresh': refresh},
          options: Options(receiveTimeout: const Duration(seconds: 120)),
        );
        return ResearchResult.fromJson(response.data ?? const {});
      });

  // ---- gap analysis (Mod 2) ---------------------------------------------------------------------------------

  Stream<GapEvent> gapStream({
    required String branchId,
    required List<UploadImage> images,
    String? extraNotes,
    String? menuText,
    CancelToken? cancelToken,
  }) async* {
    final form = FormData.fromMap({
      'branchId': branchId,
      if (extraNotes != null && extraNotes.trim().isNotEmpty) 'extraNotes': extraNotes.trim(),
      if (menuText != null && menuText.trim().isNotEmpty) 'menuText': menuText.trim(),
      'images': [
        for (final image in images)
          await MultipartFile.fromFile(image.path, filename: '${image.sha256}.jpg', contentType: DioMediaType('image', 'jpeg')),
      ],
    });
    try {
      await for (final message in streamMultipart('/gap-analysis', form, cancelToken: cancelToken)) {
        final event = GapEvent.fromSse(message.event, message.data);
        if (event != null) yield event;
      }
    } on DioException catch (e) {
      throw await _toApiException(e);
    }
  }

  Future<GapResult> gapResult(String runId) => _guard(() async {
        final response = await _dio.get<Json>('/gap-analysis/$runId');
        return GapResult.fromJson(response.data ?? const {});
      });

  /// Latest analysis of a branch, or null when it has none yet.
  Future<GapResult?> latestGap(String branchId) => _guard(() async {
        try {
          final response = await _dio.get<Json>('/branches/$branchId/gap/latest');
          return GapResult.fromJson(response.data ?? const {});
        } on DioException catch (e) {
          if (e.response?.statusCode == 404) return null;
          rethrow;
        }
      });

  Future<bool> cancelGap(String runId) => _guard(() async {
        final response = await _dio.post<Json>('/gap-analysis/$runId/cancel');
        return (response.data ?? const {}).boolean('cancelled');
      });

  // ---- generic helpers for the other feature modules ---------------------------------------------------------

  Future<Json> getJson(String path, {Map<String, Object?>? query}) => _guard(() async {
        final response = await _dio.get<Json>(path, queryParameters: query);
        return response.data ?? const {};
      });

  Future<Json> sendJson(String method, String path, {Object? body}) => _guard(() async {
        final response = await _dio.request<Json>(path, data: body, options: Options(method: method));
        return response.data ?? const {};
      });

  Future<String> getText(String path, {Map<String, Object?>? query}) => _guard(() async {
        final response = await _dio.get<String>(path, queryParameters: query, options: Options(responseType: ResponseType.plain));
        return response.data ?? '';
      });

  Stream<SseMessage> streamMultipart(String path, FormData data, {CancelToken? cancelToken}) async* {
    final Response<ResponseBody> response;
    try {
      response = await _dio.post<ResponseBody>(path, data: data, options: _sseOptions, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw await _toApiException(e);
    }
    final body = response.data;
    if (body == null) return;
    final parser = SseParser();
    await for (final chunk in utf8.decoder.bind(body.stream.cast<List<int>>())) {
      yield* Stream.fromIterable(parser.add(chunk));
    }
  }
}
