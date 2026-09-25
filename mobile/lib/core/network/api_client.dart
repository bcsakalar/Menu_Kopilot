import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../../data/models/analysis.dart';
import '../../data/models/common.dart';
import '../../data/models/history.dart';
import '../../data/models/json.dart';
import '../../data/models/settings.dart';
import '../../data/models/template_item.dart';
import '../../data/models/template_payload.dart';
import '../../data/models/transcription.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';
import 'sse.dart';

class UploadImage {
  const UploadImage({required this.path, required this.sha256});
  final String path;
  final String sha256;
}

/// How much work one analysis does. The choice the user makes on the home screen before pressing "Analiz et":
/// [quick] answers with a handful of suggestions, [full] fills the menu up to the cuisine's opening minimum and
/// asks for options on every product whose options are unknown.
enum AnalysisMode {
  quick('quick'),
  full('full');

  const AnalysisMode(this.wire);
  final String wire;

  static AnalysisMode fromWire(String value) => value == 'quick' ? AnalysisMode.quick : AnalysisMode.full;
}

/// Everything one analysis run needs. `cuisineId` may be empty: the Classifier fills it from the menu.
class AnalyzeRequestData {
  const AnalyzeRequestData({
    this.cuisineId = '',
    this.menuText = '',
    this.notes = '',
    this.mode = AnalysisMode.full,
    this.debug = false,
    this.images = const [],
    this.fromRunId = '',
  });

  final String cuisineId;
  final String menuText;
  final String notes;

  /// How much work the run does — the two-way choice on the home screen.
  final AnalysisMode mode;

  /// Re-run of an earlier analysis (another cuisine picked on the result screen): the server reuses that run's
  /// product list, so no image is sent or read again.
  final String fromRunId;

  /// Store agent input/output payloads so the hidden debug screen can show them.
  final bool debug;
  final List<UploadImage> images;

  bool get hasInput => menuText.trim().isNotEmpty || images.isNotEmpty || fromRunId.isNotEmpty;

  Json toJson() => {
        'cuisineId': cuisineId,
        'menuText': menuText,
        'notes': notes,
        'mode': mode.wire,
        'debug': debug,
        'images': images.map((i) => {'path': i.path, 'sha256': i.sha256}).toList(),
        if (fromRunId.isNotEmpty) 'fromRunId': fromRunId,
      };

  static AnalyzeRequestData fromJson(Json json) => AnalyzeRequestData(
        cuisineId: json.str('cuisineId'),
        menuText: json.str('menuText'),
        notes: json.str('notes'),
        mode: AnalysisMode.fromWire(json.str('mode')),
        debug: json.boolean('debug'),
        images: json.objects('images').map((i) => UploadImage(path: i.str('path'), sha256: i.str('sha256'))).toList(),
        fromRunId: json.str('fromRunId'),
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

  // ---- analysis (one endpoint, three sections) ---------------------------------------------------------------

  Future<FormData> _analyzeForm(AnalyzeRequestData request) async => FormData.fromMap({
        if (request.cuisineId.isNotEmpty) 'cuisineId': request.cuisineId,
        if (request.menuText.trim().isNotEmpty) 'menuText': request.menuText.trim(),
        if (request.notes.trim().isNotEmpty) 'notes': request.notes.trim(),
        'mode': request.mode.wire,
        if (request.debug) 'debug': 'true',
        if (request.fromRunId.isNotEmpty) 'fromRunId': request.fromRunId,
        'images': [
          for (final image in request.images)
            await MultipartFile.fromFile(image.path, filename: '${image.sha256}.jpg', contentType: DioMediaType('image', 'jpeg')),
        ],
      });

  Stream<AnalyzeEvent> _sse(Future<Response<ResponseBody>> Function() open) async* {
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
          final event = AnalyzeEvent.fromSse(message.event, message.data);
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

  Stream<AnalyzeEvent> analyzeStream(AnalyzeRequestData request, {CancelToken? cancelToken}) => _sse(
        () async => _dio.post<ResponseBody>(
          '/analyze',
          data: await _analyzeForm(request),
          options: _sseOptions,
          cancelToken: cancelToken,
        ),
      );

  /// Queues a run without waiting for it (offline queue flush).
  Future<String> analyzeAsync(AnalyzeRequestData request) => _guard(() async {
        final response = await _dio.post<Json>('/analyze', queryParameters: {'async': '1'}, data: await _analyzeForm(request));
        return (response.data ?? const {}).str('runId');
      });

  Stream<AnalyzeEvent> runEvents(String runId, {CancelToken? cancelToken}) => _sse(
        () => _dio.get<ResponseBody>('/analyze/$runId/events', options: _sseOptions, cancelToken: cancelToken),
      );

  Future<AnalysisResult> analysis(String runId) => _guard(() async {
        final response = await _dio.get<Json>('/analyze/$runId');
        return AnalysisResult.fromJson(response.data ?? const {});
      });

  /// The most recent analysis, or null when there is none yet. Restores the result screen on a cold open.
  Future<AnalysisResult?> latestAnalysis() => _guard(() async {
        final response = await _dio.get<Json>('/analyze/latest');
        final data = response.data;
        if (data == null || data.isEmpty) return null;
        return AnalysisResult.fromJson(data);
      });

  /// The user's analyses, newest first (D-193). Filters are optional; [before] pages back in time.
  Future<HistoryPage> analysisHistory({
    int limit = 50,
    DateTime? before,
    DateTime? from,
    DateTime? to,
    String? cuisineId,
    String? mode,
    String? query,
  }) =>
      _guard(() async {
        final response = await _dio.get<Json>(
          '/analyze/history',
          queryParameters: {
            'limit': '$limit',
            if (before != null) 'before': before.toUtc().toIso8601String(),
            if (from != null) 'from': from.toUtc().toIso8601String(),
            if (to != null) 'to': to.toUtc().toIso8601String(),
            if (cuisineId != null && cuisineId.isNotEmpty) 'cuisineId': cuisineId,
            'mode': ?mode,
            if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
          },
        );
        return HistoryPage.fromJson(response.data ?? const {});
      });

  // ---- learning loop (D-194) ----------------------------------------------------------------------------------

  /// What the team kept throwing away, which the suggestions no longer offer.
  Future<LearningResult> learning() => _guard(() async {
        final response = await _dio.get<Json>('/learning');
        return LearningResult.fromJson(response.data ?? const {});
      });

  /// "Geri al" for a product turned down in one kitchen.
  Future<int> forgetLearnedProduct({required String cuisineId, required String name}) => _guard(() async {
        final response = await _dio.post<Json>('/learning/forget', data: {'scope': 'product', 'cuisineId': cuisineId, 'value': name});
        return (response.data ?? const {}).integer('forgotten');
      });

  /// "Geri al" for a card suggestion deleted for one kind of product.
  Future<int> forgetLearnedSuggestion({required String productType, required LearnedKind kind, required String value}) =>
      _guard(() async {
        final response = await _dio.post<Json>(
          '/learning/forget',
          data: {'scope': 'suggestion', 'productType': productType, 'kind': kind.wire, 'value': value},
        );
        return (response.data ?? const {}).integer('forgotten');
      });

  Future<RunTrace> analysisTrace(String runId) => _guard(() async {
        final response = await _dio.get<Json>('/analyze/$runId/trace');
        return RunTrace.fromJson(response.data ?? const {});
      });

  Future<bool> cancelRun(String runId) => _guard(() async {
        final response = await _dio.post<Json>('/analyze/$runId/cancel');
        return (response.data ?? const {}).boolean('cancelled');
      });

  Future<AnalysisCard> accept(String itemId, {TemplatePayload? payload}) => _guard(() async {
        final response = await _dio.post<Json>('/suggestion-items/$itemId/accept', data: {'payload': ?payload?.toJson()});
        return AnalysisCard.fromJson(response.data ?? const {});
      });

  Future<AnalysisCard> skip(String itemId) => _guard(() async {
        final response = await _dio.post<Json>('/suggestion-items/$itemId/skip');
        return AnalysisCard.fromJson(response.data ?? const {});
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

  /// The category taxonomy: label, menu order and the keywords that put a product into each category.
  Future<List<MenuCategory>> categories() => _guard(() async {
        final response = await _dio.get<Json>('/categories');
        return (response.data ?? const {}).objects('data').map(MenuCategory.fromJson).toList();
      });

  Future<MenuCategory> updateCategory(String key, {String? label, List<String>? keywords}) => _guard(() async {
        final response = await _dio.patch<Json>('/categories/$key', data: {'label': ?label, 'keywords': ?keywords});
        return MenuCategory.fromJson(response.data ?? const {});
      });

  /// What a cuisine is expected to have: category → minimum products (the Gap Analyst's yardstick).
  Future<List<CuisineCategory>> cuisineCategories(String cuisineId) => _guard(() async {
        final response = await _dio.get<Json>('/cuisines/$cuisineId/categories');
        return (response.data ?? const {}).objects('data').map(CuisineCategory.fromJson).toList();
      });

  /// Replaces the whole set; a category left out is no longer expected from the cuisine.
  Future<List<CuisineCategory>> replaceCuisineCategories(String cuisineId, Map<String, int> minItemsByKey) => _guard(() async {
        final response = await _dio.put<Json>(
          '/cuisines/$cuisineId/categories',
          data: {
            'items': [
              for (final entry in minItemsByKey.entries) {'categoryKey': entry.key, 'minItems': entry.value},
            ],
          },
        );
        return (response.data ?? const {}).objects('data').map(CuisineCategory.fromJson).toList();
      });

  Future<UsageSummary> usageSummary(String range) => _guard(() async {
        final response = await _dio.get<Json>('/usage/summary', queryParameters: {'range': range});
        return UsageSummary.fromJson(response.data ?? const {});
      });

  // ---- voice notes ------------------------------------------------------------------------------------------

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
}
