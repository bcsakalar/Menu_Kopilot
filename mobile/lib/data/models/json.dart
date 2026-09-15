/// Typed, null-safe readers for decoded JSON (no dynamic calls anywhere in the app).
typedef Json = Map<String, Object?>;

extension JsonRead on Json {
  String str(String key, [String fallback = '']) {
    final value = this[key];
    return value is String ? value : fallback;
  }

  String? strOrNull(String key) {
    final value = this[key];
    return value is String ? value : null;
  }

  int integer(String key, [int fallback = 0]) {
    final value = this[key];
    if (value is int) return value;
    if (value is num) return value.toInt();
    return fallback;
  }

  int? intOrNull(String key) {
    final value = this[key];
    return value is num ? value.toInt() : null;
  }

  double? dbl(String key) {
    final value = this[key];
    return value is num ? value.toDouble() : null;
  }

  bool boolean(String key, [bool fallback = false]) {
    final value = this[key];
    return value is bool ? value : fallback;
  }

  List<String> strings(String key) {
    final value = this[key];
    return value is List ? value.whereType<String>().toList() : const <String>[];
  }

  List<Json> objects(String key) {
    final value = this[key];
    return value is List ? value.whereType<Map<String, Object?>>().toList() : const <Json>[];
  }

  Json? object(String key) {
    final value = this[key];
    return value is Map<String, Object?> ? value : null;
  }
}

Json asJson(Object? value) => value is Map<String, Object?> ? value : const <String, Object?>{};
