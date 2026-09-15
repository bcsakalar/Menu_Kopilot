import 'json.dart';

class ModelOption {
  const ModelOption({required this.id, required this.provider, required this.label, this.preview = false});

  factory ModelOption.fromJson(Json json) => ModelOption(
        id: json.str('id'),
        provider: json.str('provider'),
        label: json.str('label'),
        preview: json.boolean('preview'),
      );

  final String id;
  final String provider;
  final String label;
  final bool preview;
}

class RouteInfo extends ModelOption {
  const RouteInfo({
    required super.id,
    required super.provider,
    required super.label,
    super.preview,
    this.priority = 0,
    this.enabled = true,
    this.providerConfigured = false,
  });

  factory RouteInfo.fromJson(Json json) => RouteInfo(
        id: json.str('id'),
        provider: json.str('provider'),
        label: json.str('label'),
        preview: json.boolean('preview'),
        priority: json.integer('priority'),
        enabled: json.boolean('enabled', true),
        providerConfigured: json.boolean('providerConfigured'),
      );

  final int priority;
  final bool enabled;
  final bool providerConfigured;
}

class TaskSettings {
  const TaskSettings({required this.taskKey, required this.label, this.chain = const [], this.eligibleModels = const []});

  factory TaskSettings.fromJson(Json json) => TaskSettings(
        taskKey: json.str('taskKey'),
        label: json.str('label'),
        chain: json.objects('chain').map(RouteInfo.fromJson).toList(),
        eligibleModels: json.objects('eligibleModels').map(ModelOption.fromJson).toList(),
      );

  final String taskKey;
  final String label;

  /// Fallback chain; the first enabled entry is the primary model.
  final List<RouteInfo> chain;
  final List<ModelOption> eligibleModels;

  String? get primaryModel {
    for (final route in chain) {
      if (route.enabled) return route.id;
    }
    return null;
  }
}

class ProviderStatus {
  const ProviderStatus({required this.name, required this.configured, required this.circuit});

  factory ProviderStatus.fromJson(Json json) =>
      ProviderStatus(name: json.str('name'), configured: json.boolean('configured'), circuit: json.str('circuit', 'closed'));

  final String name;
  final bool configured;

  /// closed | open | half_open
  final String circuit;
}

class ProviderSettings {
  const ProviderSettings({this.localOnlyMode = false, this.providers = const [], this.tasks = const []});

  factory ProviderSettings.fromJson(Json json) => ProviderSettings(
        localOnlyMode: json.boolean('localOnlyMode'),
        providers: json.objects('providers').map(ProviderStatus.fromJson).toList(),
        tasks: json.objects('tasks').map(TaskSettings.fromJson).toList(),
      );

  final bool localOnlyMode;
  final List<ProviderStatus> providers;
  final List<TaskSettings> tasks;
}

class QuotaInfo {
  const QuotaInfo({
    this.allowed = true,
    this.callsToday = 0,
    this.dailyCalls = 0,
    this.tokensToday = 0,
    this.dailyTokens = 0,
    this.localOnlyMode = false,
  });

  factory QuotaInfo.fromJson(Json json) => QuotaInfo(
        allowed: json.boolean('allowed', true),
        callsToday: json.integer('callsToday'),
        dailyCalls: json.integer('dailyCalls'),
        tokensToday: json.integer('tokensToday'),
        dailyTokens: json.integer('dailyTokens'),
        localOnlyMode: json.boolean('localOnlyMode'),
      );

  final bool allowed;
  final int callsToday;
  final int dailyCalls;
  final int tokensToday;
  final int dailyTokens;
  final bool localOnlyMode;
}

class UsageCounters {
  const UsageCounters({this.calls = 0, this.failed = 0, this.tokensIn = 0, this.tokensOut = 0, this.avgLatencyMs = 0});

  factory UsageCounters.fromJson(Json json) => UsageCounters(
        calls: json.integer('calls'),
        failed: json.integer('failed'),
        tokensIn: json.integer('tokensIn'),
        tokensOut: json.integer('tokensOut'),
        avgLatencyMs: json.integer('avgLatencyMs'),
      );

  final int calls;
  final int failed;
  final int tokensIn;
  final int tokensOut;
  final int avgLatencyMs;
}

class ModelUsage {
  const ModelUsage({required this.label, required this.provider, required this.counters});

  factory ModelUsage.fromJson(Json json) =>
      ModelUsage(label: json.str('label', json.str('model')), provider: json.str('provider'), counters: UsageCounters.fromJson(json));

  final String label;
  final String provider;
  final UsageCounters counters;
}

class UsageSummary {
  const UsageSummary({
    required this.range,
    required this.totals,
    this.byModel = const [],
    this.byTask = const [],
    this.errors = const [],
    this.runs = 0,
    this.cacheHitRuns = 0,
    this.cacheHitRatio = 0,
    this.cards = 0,
    this.dbCards = 0,
    this.aiCards = 0,
    this.reviewCards = 0,
    this.dbHitRatio = 0,
    this.quota = const QuotaInfo(),
  });

  factory UsageSummary.fromJson(Json json) {
    final runs = json.object('runs') ?? const {};
    final cards = json.object('cards') ?? const {};
    return UsageSummary(
      range: json.str('range', 'today'),
      totals: UsageCounters.fromJson(json.object('totals') ?? const {}),
      byModel: json.objects('byModel').map(ModelUsage.fromJson).toList(),
      byTask: json.objects('byTask').map((t) => (label: t.str('label'), calls: t.integer('calls'), failed: t.integer('failed'))).toList(),
      errors: json.objects('errors').map((e) => (code: e.str('code'), count: e.integer('count'))).toList(),
      runs: runs.integer('total'),
      cacheHitRuns: runs.integer('cacheHit'),
      cacheHitRatio: runs.dbl('cacheHitRatio') ?? 0,
      cards: cards.integer('total'),
      dbCards: cards.integer('fromDb'),
      aiCards: cards.integer('ai'),
      reviewCards: cards.integer('review'),
      dbHitRatio: cards.dbl('dbHitRatio') ?? 0,
      quota: QuotaInfo.fromJson(json.object('quota') ?? const {}),
    );
  }

  final String range;
  final UsageCounters totals;
  final List<ModelUsage> byModel;
  final List<({String label, int calls, int failed})> byTask;
  final List<({String code, int count})> errors;
  final int runs;
  final int cacheHitRuns;
  final double cacheHitRatio;
  final int cards;
  final int dbCards;
  final int aiCards;
  final int reviewCards;
  final double dbHitRatio;
  final QuotaInfo quota;
}
