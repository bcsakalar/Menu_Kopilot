import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/common.dart';
import '../data/models/json.dart';
import 'network/api_client.dart';
import 'network/api_exception.dart';
import 'storage/app_database.dart';
import 'storage/token_store.dart';

/// Overridden in main() with the real database (and with an in-memory one in tests).
final appDatabaseProvider = Provider<AppDatabase>((ref) => throw UnimplementedError('appDatabaseProvider not overridden'));

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

/// Build-time default (e.g. `--dart-define=API_BASE_URL=https://api.example.com`); editable at login/settings.
const String defaultServerUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '');

/// D-199: the key the release build carries (`--dart-define=APP_ACCESS_KEY=…`, the server's APP_ACCESS_KEY). With it
/// the app signs itself in to the team account and opens straight to work — no e-mail, no password. Without it (a
/// development build) the login screen is used as before.
const String appAccessKey = String.fromEnvironment('APP_ACCESS_KEY', defaultValue: '');

/// True when this build signs itself in.
bool get deviceSignIn => appAccessKey.isNotEmpty;
const String serverUrlKey = 'server.url';

class ServerUrlController extends AsyncNotifier<String> {
  @override
  Future<String> build() async => (await ref.read(appDatabaseProvider).readKv(serverUrlKey)) ?? defaultServerUrl;

  Future<void> set(String url) async {
    final trimmed = url.trim();
    await ref.read(appDatabaseProvider).writeKv(serverUrlKey, trimmed);
    state = AsyncData(trimmed);
  }
}

final serverUrlProvider = AsyncNotifierProvider<ServerUrlController, String>(ServerUrlController.new);

final apiClientProvider = Provider<ApiClient>((ref) {
  final url = ref.watch(serverUrlProvider).value ?? defaultServerUrl;
  return ApiClient(
    baseUrl: url.isEmpty ? 'http://localhost' : url,
    tokens: ref.watch(tokenStoreProvider),
    onSessionExpired: () => ref.read(authControllerProvider.notifier).sessionExpired(),
    onSessionChanged: (session) => ref.read(authControllerProvider.notifier).sessionChanged(session),
    appKey: appAccessKey,
    deviceName: 'menu-kopilot-${Platform.operatingSystem}',
  );
});

class AuthController extends AsyncNotifier<AuthSession?> {
  @override
  Future<AuthSession?> build() async {
    final stored = await ref.read(tokenStoreProvider).read();
    if (stored != null || !deviceSignIn) return stored;
    try {
      return await ref.read(apiClientProvider).ensureSession();
    } on Object {
      // Offline on the first start: the app opens anyway, and the first request that reaches the server signs in.
      return null;
    }
  }

  /// The client opened a new device session by itself (D-199).
  void sessionChanged(AuthSession session) {
    state = AsyncData(session);
  }

  Future<void> login({required String serverUrl, required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(serverUrlProvider.notifier).set(serverUrl);
      final session = await ref.read(apiClientProvider).login(email.trim(), password, 'menu-kopilot-${Platform.operatingSystem}');
      await ref.read(tokenStoreProvider).write(session);
      return session;
    });
  }

  Future<void> logout() async {
    try {
      await ref.read(apiClientProvider).logout();
    } on ApiException {
      // offline logout still clears the local session
    }
    await ref.read(tokenStoreProvider).clear();
    state = const AsyncData(null);
  }

  void sessionExpired() {
    state = const AsyncData(null);
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

/// true when some network interface is up (the queue flushes on the false → true edge).
final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  bool online(List<ConnectivityResult> results) => results.any((r) => r != ConnectivityResult.none);
  yield online(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(online);
});

const String cuisinesCacheKey = 'cache.cuisines';
const String recentCuisinesKey = 'recent.cuisines';

/// Cuisine list; falls back to the last cached copy when offline.
final cuisinesProvider = FutureProvider<List<Cuisine>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final api = ref.watch(apiClientProvider);
  try {
    final list = await api.cuisines();
    await db.writeKv(cuisinesCacheKey, jsonEncode(list.map((c) => c.toJson()).toList()));
    return list;
  } on ApiException catch (e) {
    if (!e.isNetwork) rethrow;
    final cached = await db.readKv(cuisinesCacheKey);
    if (cached == null) rethrow;
    final decoded = jsonDecode(cached);
    return decoded is List ? decoded.whereType<Map<String, Object?>>().map((j) => Cuisine.fromJson(j)).toList() : <Cuisine>[];
  }
});

class RecentCuisinesController extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() async {
    final raw = await ref.read(appDatabaseProvider).readKv(recentCuisinesKey);
    if (raw == null) return const [];
    final decoded = jsonDecode(raw);
    return decoded is List ? decoded.whereType<String>().toList() : const [];
  }

  Future<void> touch(String cuisineId) async {
    final current = state.value ?? const <String>[];
    final next = [cuisineId, ...current.where((id) => id != cuisineId)].take(5).toList();
    await ref.read(appDatabaseProvider).writeKv(recentCuisinesKey, jsonEncode(next));
    state = AsyncData(next);
  }
}

final recentCuisinesProvider = AsyncNotifierProvider<RecentCuisinesController, List<String>>(RecentCuisinesController.new);

Json decodeJson(String raw) => asJson(jsonDecode(raw));
