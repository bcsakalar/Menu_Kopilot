// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $KvEntriesTable extends KvEntries
    with TableInfo<$KvEntriesTable, KvEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KvEntriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'kv_entries';
  @override
  VerificationContext validateIntegrity(
    Insertable<KvEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  KvEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KvEntry(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $KvEntriesTable createAlias(String alias) {
    return $KvEntriesTable(attachedDatabase, alias);
  }
}

class KvEntry extends DataClass implements Insertable<KvEntry> {
  final String key;
  final String value;
  const KvEntry({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  KvEntriesCompanion toCompanion(bool nullToAbsent) {
    return KvEntriesCompanion(key: Value(key), value: Value(value));
  }

  factory KvEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KvEntry(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  KvEntry copyWith({String? key, String? value}) =>
      KvEntry(key: key ?? this.key, value: value ?? this.value);
  KvEntry copyWithCompanion(KvEntriesCompanion data) {
    return KvEntry(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KvEntry(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KvEntry && other.key == this.key && other.value == this.value);
}

class KvEntriesCompanion extends UpdateCompanion<KvEntry> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const KvEntriesCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KvEntriesCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<KvEntry> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KvEntriesCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return KvEntriesCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KvEntriesCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RecentRunsTable extends RecentRuns
    with TableInfo<$RecentRunsTable, RecentRun> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RecentRunsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _runIdMeta = const VerificationMeta('runId');
  @override
  late final GeneratedColumn<String> runId = GeneratedColumn<String>(
    'run_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cuisineIdMeta = const VerificationMeta(
    'cuisineId',
  );
  @override
  late final GeneratedColumn<String> cuisineId = GeneratedColumn<String>(
    'cuisine_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cuisineNameMeta = const VerificationMeta(
    'cuisineName',
  );
  @override
  late final GeneratedColumn<String> cuisineName = GeneratedColumn<String>(
    'cuisine_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cardCountMeta = const VerificationMeta(
    'cardCount',
  );
  @override
  late final GeneratedColumn<int> cardCount = GeneratedColumn<int>(
    'card_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _snapshotJsonMeta = const VerificationMeta(
    'snapshotJson',
  );
  @override
  late final GeneratedColumn<String> snapshotJson = GeneratedColumn<String>(
    'snapshot_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _modeMeta = const VerificationMeta('mode');
  @override
  late final GeneratedColumn<String> mode = GeneratedColumn<String>(
    'mode',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _finishedAtMeta = const VerificationMeta(
    'finishedAt',
  );
  @override
  late final GeneratedColumn<DateTime> finishedAt = GeneratedColumn<DateTime>(
    'finished_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _productNamesJsonMeta = const VerificationMeta(
    'productNamesJson',
  );
  @override
  late final GeneratedColumn<String> productNamesJson = GeneratedColumn<String>(
    'product_names_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _menuCountMeta = const VerificationMeta(
    'menuCount',
  );
  @override
  late final GeneratedColumn<int> menuCount = GeneratedColumn<int>(
    'menu_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _newCountMeta = const VerificationMeta(
    'newCount',
  );
  @override
  late final GeneratedColumn<int> newCount = GeneratedColumn<int>(
    'new_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _menuCardCountMeta = const VerificationMeta(
    'menuCardCount',
  );
  @override
  late final GeneratedColumn<int> menuCardCount = GeneratedColumn<int>(
    'menu_card_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _acceptedCountMeta = const VerificationMeta(
    'acceptedCount',
  );
  @override
  late final GeneratedColumn<int> acceptedCount = GeneratedColumn<int>(
    'accepted_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _skippedCountMeta = const VerificationMeta(
    'skippedCount',
  );
  @override
  late final GeneratedColumn<int> skippedCount = GeneratedColumn<int>(
    'skipped_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _currentCountMeta = const VerificationMeta(
    'currentCount',
  );
  @override
  late final GeneratedColumn<int> currentCount = GeneratedColumn<int>(
    'current_count',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _targetCountMeta = const VerificationMeta(
    'targetCount',
  );
  @override
  late final GeneratedColumn<int> targetCount = GeneratedColumn<int>(
    'target_count',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _laterCountMeta = const VerificationMeta(
    'laterCount',
  );
  @override
  late final GeneratedColumn<int> laterCount = GeneratedColumn<int>(
    'later_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [
    runId,
    cuisineId,
    cuisineName,
    title,
    status,
    cardCount,
    snapshotJson,
    createdAt,
    mode,
    finishedAt,
    productNamesJson,
    menuCount,
    newCount,
    menuCardCount,
    acceptedCount,
    skippedCount,
    currentCount,
    targetCount,
    laterCount,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'recent_runs';
  @override
  VerificationContext validateIntegrity(
    Insertable<RecentRun> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('run_id')) {
      context.handle(
        _runIdMeta,
        runId.isAcceptableOrUnknown(data['run_id']!, _runIdMeta),
      );
    } else if (isInserting) {
      context.missing(_runIdMeta);
    }
    if (data.containsKey('cuisine_id')) {
      context.handle(
        _cuisineIdMeta,
        cuisineId.isAcceptableOrUnknown(data['cuisine_id']!, _cuisineIdMeta),
      );
    }
    if (data.containsKey('cuisine_name')) {
      context.handle(
        _cuisineNameMeta,
        cuisineName.isAcceptableOrUnknown(
          data['cuisine_name']!,
          _cuisineNameMeta,
        ),
      );
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('card_count')) {
      context.handle(
        _cardCountMeta,
        cardCount.isAcceptableOrUnknown(data['card_count']!, _cardCountMeta),
      );
    }
    if (data.containsKey('snapshot_json')) {
      context.handle(
        _snapshotJsonMeta,
        snapshotJson.isAcceptableOrUnknown(
          data['snapshot_json']!,
          _snapshotJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_snapshotJsonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('mode')) {
      context.handle(
        _modeMeta,
        mode.isAcceptableOrUnknown(data['mode']!, _modeMeta),
      );
    }
    if (data.containsKey('finished_at')) {
      context.handle(
        _finishedAtMeta,
        finishedAt.isAcceptableOrUnknown(data['finished_at']!, _finishedAtMeta),
      );
    }
    if (data.containsKey('product_names_json')) {
      context.handle(
        _productNamesJsonMeta,
        productNamesJson.isAcceptableOrUnknown(
          data['product_names_json']!,
          _productNamesJsonMeta,
        ),
      );
    }
    if (data.containsKey('menu_count')) {
      context.handle(
        _menuCountMeta,
        menuCount.isAcceptableOrUnknown(data['menu_count']!, _menuCountMeta),
      );
    }
    if (data.containsKey('new_count')) {
      context.handle(
        _newCountMeta,
        newCount.isAcceptableOrUnknown(data['new_count']!, _newCountMeta),
      );
    }
    if (data.containsKey('menu_card_count')) {
      context.handle(
        _menuCardCountMeta,
        menuCardCount.isAcceptableOrUnknown(
          data['menu_card_count']!,
          _menuCardCountMeta,
        ),
      );
    }
    if (data.containsKey('accepted_count')) {
      context.handle(
        _acceptedCountMeta,
        acceptedCount.isAcceptableOrUnknown(
          data['accepted_count']!,
          _acceptedCountMeta,
        ),
      );
    }
    if (data.containsKey('skipped_count')) {
      context.handle(
        _skippedCountMeta,
        skippedCount.isAcceptableOrUnknown(
          data['skipped_count']!,
          _skippedCountMeta,
        ),
      );
    }
    if (data.containsKey('current_count')) {
      context.handle(
        _currentCountMeta,
        currentCount.isAcceptableOrUnknown(
          data['current_count']!,
          _currentCountMeta,
        ),
      );
    }
    if (data.containsKey('target_count')) {
      context.handle(
        _targetCountMeta,
        targetCount.isAcceptableOrUnknown(
          data['target_count']!,
          _targetCountMeta,
        ),
      );
    }
    if (data.containsKey('later_count')) {
      context.handle(
        _laterCountMeta,
        laterCount.isAcceptableOrUnknown(data['later_count']!, _laterCountMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {runId};
  @override
  RecentRun map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RecentRun(
      runId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}run_id'],
      )!,
      cuisineId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cuisine_id'],
      ),
      cuisineName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cuisine_name'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      cardCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}card_count'],
      )!,
      snapshotJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}snapshot_json'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      mode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}mode'],
      ),
      finishedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}finished_at'],
      ),
      productNamesJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_names_json'],
      )!,
      menuCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}menu_count'],
      )!,
      newCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}new_count'],
      )!,
      menuCardCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}menu_card_count'],
      )!,
      acceptedCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}accepted_count'],
      )!,
      skippedCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}skipped_count'],
      )!,
      currentCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}current_count'],
      ),
      targetCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}target_count'],
      ),
      laterCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}later_count'],
      )!,
    );
  }

  @override
  $RecentRunsTable createAlias(String alias) {
    return $RecentRunsTable(attachedDatabase, alias);
  }
}

class RecentRun extends DataClass implements Insertable<RecentRun> {
  final String runId;
  final String? cuisineId;
  final String cuisineName;
  final String title;
  final String status;
  final int cardCount;
  final String snapshotJson;
  final DateTime createdAt;

  /// "quick" or "full"; null for runs made before it was stored.
  final String? mode;
  final DateTime? finishedAt;

  /// The first products of the menu, a JSON list — the row's title and what the search looks in.
  final String productNamesJson;
  final int menuCount;
  final int newCount;
  final int menuCardCount;
  final int acceptedCount;
  final int skippedCount;
  final int? currentCount;
  final int? targetCount;
  final int laterCount;
  const RecentRun({
    required this.runId,
    this.cuisineId,
    required this.cuisineName,
    required this.title,
    required this.status,
    required this.cardCount,
    required this.snapshotJson,
    required this.createdAt,
    this.mode,
    this.finishedAt,
    required this.productNamesJson,
    required this.menuCount,
    required this.newCount,
    required this.menuCardCount,
    required this.acceptedCount,
    required this.skippedCount,
    this.currentCount,
    this.targetCount,
    required this.laterCount,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['run_id'] = Variable<String>(runId);
    if (!nullToAbsent || cuisineId != null) {
      map['cuisine_id'] = Variable<String>(cuisineId);
    }
    map['cuisine_name'] = Variable<String>(cuisineName);
    map['title'] = Variable<String>(title);
    map['status'] = Variable<String>(status);
    map['card_count'] = Variable<int>(cardCount);
    map['snapshot_json'] = Variable<String>(snapshotJson);
    map['created_at'] = Variable<DateTime>(createdAt);
    if (!nullToAbsent || mode != null) {
      map['mode'] = Variable<String>(mode);
    }
    if (!nullToAbsent || finishedAt != null) {
      map['finished_at'] = Variable<DateTime>(finishedAt);
    }
    map['product_names_json'] = Variable<String>(productNamesJson);
    map['menu_count'] = Variable<int>(menuCount);
    map['new_count'] = Variable<int>(newCount);
    map['menu_card_count'] = Variable<int>(menuCardCount);
    map['accepted_count'] = Variable<int>(acceptedCount);
    map['skipped_count'] = Variable<int>(skippedCount);
    if (!nullToAbsent || currentCount != null) {
      map['current_count'] = Variable<int>(currentCount);
    }
    if (!nullToAbsent || targetCount != null) {
      map['target_count'] = Variable<int>(targetCount);
    }
    map['later_count'] = Variable<int>(laterCount);
    return map;
  }

  RecentRunsCompanion toCompanion(bool nullToAbsent) {
    return RecentRunsCompanion(
      runId: Value(runId),
      cuisineId: cuisineId == null && nullToAbsent
          ? const Value.absent()
          : Value(cuisineId),
      cuisineName: Value(cuisineName),
      title: Value(title),
      status: Value(status),
      cardCount: Value(cardCount),
      snapshotJson: Value(snapshotJson),
      createdAt: Value(createdAt),
      mode: mode == null && nullToAbsent ? const Value.absent() : Value(mode),
      finishedAt: finishedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(finishedAt),
      productNamesJson: Value(productNamesJson),
      menuCount: Value(menuCount),
      newCount: Value(newCount),
      menuCardCount: Value(menuCardCount),
      acceptedCount: Value(acceptedCount),
      skippedCount: Value(skippedCount),
      currentCount: currentCount == null && nullToAbsent
          ? const Value.absent()
          : Value(currentCount),
      targetCount: targetCount == null && nullToAbsent
          ? const Value.absent()
          : Value(targetCount),
      laterCount: Value(laterCount),
    );
  }

  factory RecentRun.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RecentRun(
      runId: serializer.fromJson<String>(json['runId']),
      cuisineId: serializer.fromJson<String?>(json['cuisineId']),
      cuisineName: serializer.fromJson<String>(json['cuisineName']),
      title: serializer.fromJson<String>(json['title']),
      status: serializer.fromJson<String>(json['status']),
      cardCount: serializer.fromJson<int>(json['cardCount']),
      snapshotJson: serializer.fromJson<String>(json['snapshotJson']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      mode: serializer.fromJson<String?>(json['mode']),
      finishedAt: serializer.fromJson<DateTime?>(json['finishedAt']),
      productNamesJson: serializer.fromJson<String>(json['productNamesJson']),
      menuCount: serializer.fromJson<int>(json['menuCount']),
      newCount: serializer.fromJson<int>(json['newCount']),
      menuCardCount: serializer.fromJson<int>(json['menuCardCount']),
      acceptedCount: serializer.fromJson<int>(json['acceptedCount']),
      skippedCount: serializer.fromJson<int>(json['skippedCount']),
      currentCount: serializer.fromJson<int?>(json['currentCount']),
      targetCount: serializer.fromJson<int?>(json['targetCount']),
      laterCount: serializer.fromJson<int>(json['laterCount']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'runId': serializer.toJson<String>(runId),
      'cuisineId': serializer.toJson<String?>(cuisineId),
      'cuisineName': serializer.toJson<String>(cuisineName),
      'title': serializer.toJson<String>(title),
      'status': serializer.toJson<String>(status),
      'cardCount': serializer.toJson<int>(cardCount),
      'snapshotJson': serializer.toJson<String>(snapshotJson),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'mode': serializer.toJson<String?>(mode),
      'finishedAt': serializer.toJson<DateTime?>(finishedAt),
      'productNamesJson': serializer.toJson<String>(productNamesJson),
      'menuCount': serializer.toJson<int>(menuCount),
      'newCount': serializer.toJson<int>(newCount),
      'menuCardCount': serializer.toJson<int>(menuCardCount),
      'acceptedCount': serializer.toJson<int>(acceptedCount),
      'skippedCount': serializer.toJson<int>(skippedCount),
      'currentCount': serializer.toJson<int?>(currentCount),
      'targetCount': serializer.toJson<int?>(targetCount),
      'laterCount': serializer.toJson<int>(laterCount),
    };
  }

  RecentRun copyWith({
    String? runId,
    Value<String?> cuisineId = const Value.absent(),
    String? cuisineName,
    String? title,
    String? status,
    int? cardCount,
    String? snapshotJson,
    DateTime? createdAt,
    Value<String?> mode = const Value.absent(),
    Value<DateTime?> finishedAt = const Value.absent(),
    String? productNamesJson,
    int? menuCount,
    int? newCount,
    int? menuCardCount,
    int? acceptedCount,
    int? skippedCount,
    Value<int?> currentCount = const Value.absent(),
    Value<int?> targetCount = const Value.absent(),
    int? laterCount,
  }) => RecentRun(
    runId: runId ?? this.runId,
    cuisineId: cuisineId.present ? cuisineId.value : this.cuisineId,
    cuisineName: cuisineName ?? this.cuisineName,
    title: title ?? this.title,
    status: status ?? this.status,
    cardCount: cardCount ?? this.cardCount,
    snapshotJson: snapshotJson ?? this.snapshotJson,
    createdAt: createdAt ?? this.createdAt,
    mode: mode.present ? mode.value : this.mode,
    finishedAt: finishedAt.present ? finishedAt.value : this.finishedAt,
    productNamesJson: productNamesJson ?? this.productNamesJson,
    menuCount: menuCount ?? this.menuCount,
    newCount: newCount ?? this.newCount,
    menuCardCount: menuCardCount ?? this.menuCardCount,
    acceptedCount: acceptedCount ?? this.acceptedCount,
    skippedCount: skippedCount ?? this.skippedCount,
    currentCount: currentCount.present ? currentCount.value : this.currentCount,
    targetCount: targetCount.present ? targetCount.value : this.targetCount,
    laterCount: laterCount ?? this.laterCount,
  );
  RecentRun copyWithCompanion(RecentRunsCompanion data) {
    return RecentRun(
      runId: data.runId.present ? data.runId.value : this.runId,
      cuisineId: data.cuisineId.present ? data.cuisineId.value : this.cuisineId,
      cuisineName: data.cuisineName.present
          ? data.cuisineName.value
          : this.cuisineName,
      title: data.title.present ? data.title.value : this.title,
      status: data.status.present ? data.status.value : this.status,
      cardCount: data.cardCount.present ? data.cardCount.value : this.cardCount,
      snapshotJson: data.snapshotJson.present
          ? data.snapshotJson.value
          : this.snapshotJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      mode: data.mode.present ? data.mode.value : this.mode,
      finishedAt: data.finishedAt.present
          ? data.finishedAt.value
          : this.finishedAt,
      productNamesJson: data.productNamesJson.present
          ? data.productNamesJson.value
          : this.productNamesJson,
      menuCount: data.menuCount.present ? data.menuCount.value : this.menuCount,
      newCount: data.newCount.present ? data.newCount.value : this.newCount,
      menuCardCount: data.menuCardCount.present
          ? data.menuCardCount.value
          : this.menuCardCount,
      acceptedCount: data.acceptedCount.present
          ? data.acceptedCount.value
          : this.acceptedCount,
      skippedCount: data.skippedCount.present
          ? data.skippedCount.value
          : this.skippedCount,
      currentCount: data.currentCount.present
          ? data.currentCount.value
          : this.currentCount,
      targetCount: data.targetCount.present
          ? data.targetCount.value
          : this.targetCount,
      laterCount: data.laterCount.present
          ? data.laterCount.value
          : this.laterCount,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RecentRun(')
          ..write('runId: $runId, ')
          ..write('cuisineId: $cuisineId, ')
          ..write('cuisineName: $cuisineName, ')
          ..write('title: $title, ')
          ..write('status: $status, ')
          ..write('cardCount: $cardCount, ')
          ..write('snapshotJson: $snapshotJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('mode: $mode, ')
          ..write('finishedAt: $finishedAt, ')
          ..write('productNamesJson: $productNamesJson, ')
          ..write('menuCount: $menuCount, ')
          ..write('newCount: $newCount, ')
          ..write('menuCardCount: $menuCardCount, ')
          ..write('acceptedCount: $acceptedCount, ')
          ..write('skippedCount: $skippedCount, ')
          ..write('currentCount: $currentCount, ')
          ..write('targetCount: $targetCount, ')
          ..write('laterCount: $laterCount')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    runId,
    cuisineId,
    cuisineName,
    title,
    status,
    cardCount,
    snapshotJson,
    createdAt,
    mode,
    finishedAt,
    productNamesJson,
    menuCount,
    newCount,
    menuCardCount,
    acceptedCount,
    skippedCount,
    currentCount,
    targetCount,
    laterCount,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecentRun &&
          other.runId == this.runId &&
          other.cuisineId == this.cuisineId &&
          other.cuisineName == this.cuisineName &&
          other.title == this.title &&
          other.status == this.status &&
          other.cardCount == this.cardCount &&
          other.snapshotJson == this.snapshotJson &&
          other.createdAt == this.createdAt &&
          other.mode == this.mode &&
          other.finishedAt == this.finishedAt &&
          other.productNamesJson == this.productNamesJson &&
          other.menuCount == this.menuCount &&
          other.newCount == this.newCount &&
          other.menuCardCount == this.menuCardCount &&
          other.acceptedCount == this.acceptedCount &&
          other.skippedCount == this.skippedCount &&
          other.currentCount == this.currentCount &&
          other.targetCount == this.targetCount &&
          other.laterCount == this.laterCount);
}

class RecentRunsCompanion extends UpdateCompanion<RecentRun> {
  final Value<String> runId;
  final Value<String?> cuisineId;
  final Value<String> cuisineName;
  final Value<String> title;
  final Value<String> status;
  final Value<int> cardCount;
  final Value<String> snapshotJson;
  final Value<DateTime> createdAt;
  final Value<String?> mode;
  final Value<DateTime?> finishedAt;
  final Value<String> productNamesJson;
  final Value<int> menuCount;
  final Value<int> newCount;
  final Value<int> menuCardCount;
  final Value<int> acceptedCount;
  final Value<int> skippedCount;
  final Value<int?> currentCount;
  final Value<int?> targetCount;
  final Value<int> laterCount;
  final Value<int> rowid;
  const RecentRunsCompanion({
    this.runId = const Value.absent(),
    this.cuisineId = const Value.absent(),
    this.cuisineName = const Value.absent(),
    this.title = const Value.absent(),
    this.status = const Value.absent(),
    this.cardCount = const Value.absent(),
    this.snapshotJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.mode = const Value.absent(),
    this.finishedAt = const Value.absent(),
    this.productNamesJson = const Value.absent(),
    this.menuCount = const Value.absent(),
    this.newCount = const Value.absent(),
    this.menuCardCount = const Value.absent(),
    this.acceptedCount = const Value.absent(),
    this.skippedCount = const Value.absent(),
    this.currentCount = const Value.absent(),
    this.targetCount = const Value.absent(),
    this.laterCount = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RecentRunsCompanion.insert({
    required String runId,
    this.cuisineId = const Value.absent(),
    this.cuisineName = const Value.absent(),
    this.title = const Value.absent(),
    required String status,
    this.cardCount = const Value.absent(),
    required String snapshotJson,
    required DateTime createdAt,
    this.mode = const Value.absent(),
    this.finishedAt = const Value.absent(),
    this.productNamesJson = const Value.absent(),
    this.menuCount = const Value.absent(),
    this.newCount = const Value.absent(),
    this.menuCardCount = const Value.absent(),
    this.acceptedCount = const Value.absent(),
    this.skippedCount = const Value.absent(),
    this.currentCount = const Value.absent(),
    this.targetCount = const Value.absent(),
    this.laterCount = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : runId = Value(runId),
       status = Value(status),
       snapshotJson = Value(snapshotJson),
       createdAt = Value(createdAt);
  static Insertable<RecentRun> custom({
    Expression<String>? runId,
    Expression<String>? cuisineId,
    Expression<String>? cuisineName,
    Expression<String>? title,
    Expression<String>? status,
    Expression<int>? cardCount,
    Expression<String>? snapshotJson,
    Expression<DateTime>? createdAt,
    Expression<String>? mode,
    Expression<DateTime>? finishedAt,
    Expression<String>? productNamesJson,
    Expression<int>? menuCount,
    Expression<int>? newCount,
    Expression<int>? menuCardCount,
    Expression<int>? acceptedCount,
    Expression<int>? skippedCount,
    Expression<int>? currentCount,
    Expression<int>? targetCount,
    Expression<int>? laterCount,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (runId != null) 'run_id': runId,
      if (cuisineId != null) 'cuisine_id': cuisineId,
      if (cuisineName != null) 'cuisine_name': cuisineName,
      if (title != null) 'title': title,
      if (status != null) 'status': status,
      if (cardCount != null) 'card_count': cardCount,
      if (snapshotJson != null) 'snapshot_json': snapshotJson,
      if (createdAt != null) 'created_at': createdAt,
      if (mode != null) 'mode': mode,
      if (finishedAt != null) 'finished_at': finishedAt,
      if (productNamesJson != null) 'product_names_json': productNamesJson,
      if (menuCount != null) 'menu_count': menuCount,
      if (newCount != null) 'new_count': newCount,
      if (menuCardCount != null) 'menu_card_count': menuCardCount,
      if (acceptedCount != null) 'accepted_count': acceptedCount,
      if (skippedCount != null) 'skipped_count': skippedCount,
      if (currentCount != null) 'current_count': currentCount,
      if (targetCount != null) 'target_count': targetCount,
      if (laterCount != null) 'later_count': laterCount,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RecentRunsCompanion copyWith({
    Value<String>? runId,
    Value<String?>? cuisineId,
    Value<String>? cuisineName,
    Value<String>? title,
    Value<String>? status,
    Value<int>? cardCount,
    Value<String>? snapshotJson,
    Value<DateTime>? createdAt,
    Value<String?>? mode,
    Value<DateTime?>? finishedAt,
    Value<String>? productNamesJson,
    Value<int>? menuCount,
    Value<int>? newCount,
    Value<int>? menuCardCount,
    Value<int>? acceptedCount,
    Value<int>? skippedCount,
    Value<int?>? currentCount,
    Value<int?>? targetCount,
    Value<int>? laterCount,
    Value<int>? rowid,
  }) {
    return RecentRunsCompanion(
      runId: runId ?? this.runId,
      cuisineId: cuisineId ?? this.cuisineId,
      cuisineName: cuisineName ?? this.cuisineName,
      title: title ?? this.title,
      status: status ?? this.status,
      cardCount: cardCount ?? this.cardCount,
      snapshotJson: snapshotJson ?? this.snapshotJson,
      createdAt: createdAt ?? this.createdAt,
      mode: mode ?? this.mode,
      finishedAt: finishedAt ?? this.finishedAt,
      productNamesJson: productNamesJson ?? this.productNamesJson,
      menuCount: menuCount ?? this.menuCount,
      newCount: newCount ?? this.newCount,
      menuCardCount: menuCardCount ?? this.menuCardCount,
      acceptedCount: acceptedCount ?? this.acceptedCount,
      skippedCount: skippedCount ?? this.skippedCount,
      currentCount: currentCount ?? this.currentCount,
      targetCount: targetCount ?? this.targetCount,
      laterCount: laterCount ?? this.laterCount,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (runId.present) {
      map['run_id'] = Variable<String>(runId.value);
    }
    if (cuisineId.present) {
      map['cuisine_id'] = Variable<String>(cuisineId.value);
    }
    if (cuisineName.present) {
      map['cuisine_name'] = Variable<String>(cuisineName.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (cardCount.present) {
      map['card_count'] = Variable<int>(cardCount.value);
    }
    if (snapshotJson.present) {
      map['snapshot_json'] = Variable<String>(snapshotJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (mode.present) {
      map['mode'] = Variable<String>(mode.value);
    }
    if (finishedAt.present) {
      map['finished_at'] = Variable<DateTime>(finishedAt.value);
    }
    if (productNamesJson.present) {
      map['product_names_json'] = Variable<String>(productNamesJson.value);
    }
    if (menuCount.present) {
      map['menu_count'] = Variable<int>(menuCount.value);
    }
    if (newCount.present) {
      map['new_count'] = Variable<int>(newCount.value);
    }
    if (menuCardCount.present) {
      map['menu_card_count'] = Variable<int>(menuCardCount.value);
    }
    if (acceptedCount.present) {
      map['accepted_count'] = Variable<int>(acceptedCount.value);
    }
    if (skippedCount.present) {
      map['skipped_count'] = Variable<int>(skippedCount.value);
    }
    if (currentCount.present) {
      map['current_count'] = Variable<int>(currentCount.value);
    }
    if (targetCount.present) {
      map['target_count'] = Variable<int>(targetCount.value);
    }
    if (laterCount.present) {
      map['later_count'] = Variable<int>(laterCount.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RecentRunsCompanion(')
          ..write('runId: $runId, ')
          ..write('cuisineId: $cuisineId, ')
          ..write('cuisineName: $cuisineName, ')
          ..write('title: $title, ')
          ..write('status: $status, ')
          ..write('cardCount: $cardCount, ')
          ..write('snapshotJson: $snapshotJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('mode: $mode, ')
          ..write('finishedAt: $finishedAt, ')
          ..write('productNamesJson: $productNamesJson, ')
          ..write('menuCount: $menuCount, ')
          ..write('newCount: $newCount, ')
          ..write('menuCardCount: $menuCardCount, ')
          ..write('acceptedCount: $acceptedCount, ')
          ..write('skippedCount: $skippedCount, ')
          ..write('currentCount: $currentCount, ')
          ..write('targetCount: $targetCount, ')
          ..write('laterCount: $laterCount, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PendingRequestsTable extends PendingRequests
    with TableInfo<$PendingRequestsTable, PendingRequest> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PendingRequestsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _imagePathsJsonMeta = const VerificationMeta(
    'imagePathsJson',
  );
  @override
  late final GeneratedColumn<String> imagePathsJson = GeneratedColumn<String>(
    'image_paths_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('queued'),
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serverRunIdMeta = const VerificationMeta(
    'serverRunId',
  );
  @override
  late final GeneratedColumn<String> serverRunId = GeneratedColumn<String>(
    'server_run_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    kind,
    payloadJson,
    imagePathsJson,
    status,
    attempts,
    lastError,
    serverRunId,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_requests';
  @override
  VerificationContext validateIntegrity(
    Insertable<PendingRequest> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('image_paths_json')) {
      context.handle(
        _imagePathsJsonMeta,
        imagePathsJson.isAcceptableOrUnknown(
          data['image_paths_json']!,
          _imagePathsJsonMeta,
        ),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('server_run_id')) {
      context.handle(
        _serverRunIdMeta,
        serverRunId.isAcceptableOrUnknown(
          data['server_run_id']!,
          _serverRunIdMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PendingRequest map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingRequest(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      imagePathsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_paths_json'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      serverRunId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_run_id'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $PendingRequestsTable createAlias(String alias) {
    return $PendingRequestsTable(attachedDatabase, alias);
  }
}

class PendingRequest extends DataClass implements Insertable<PendingRequest> {
  final String id;
  final String kind;
  final String payloadJson;
  final String imagePathsJson;
  final String status;
  final int attempts;
  final String? lastError;
  final String? serverRunId;
  final DateTime createdAt;
  const PendingRequest({
    required this.id,
    required this.kind,
    required this.payloadJson,
    required this.imagePathsJson,
    required this.status,
    required this.attempts,
    this.lastError,
    this.serverRunId,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['kind'] = Variable<String>(kind);
    map['payload_json'] = Variable<String>(payloadJson);
    map['image_paths_json'] = Variable<String>(imagePathsJson);
    map['status'] = Variable<String>(status);
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    if (!nullToAbsent || serverRunId != null) {
      map['server_run_id'] = Variable<String>(serverRunId);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  PendingRequestsCompanion toCompanion(bool nullToAbsent) {
    return PendingRequestsCompanion(
      id: Value(id),
      kind: Value(kind),
      payloadJson: Value(payloadJson),
      imagePathsJson: Value(imagePathsJson),
      status: Value(status),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      serverRunId: serverRunId == null && nullToAbsent
          ? const Value.absent()
          : Value(serverRunId),
      createdAt: Value(createdAt),
    );
  }

  factory PendingRequest.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingRequest(
      id: serializer.fromJson<String>(json['id']),
      kind: serializer.fromJson<String>(json['kind']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      imagePathsJson: serializer.fromJson<String>(json['imagePathsJson']),
      status: serializer.fromJson<String>(json['status']),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      serverRunId: serializer.fromJson<String?>(json['serverRunId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'kind': serializer.toJson<String>(kind),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'imagePathsJson': serializer.toJson<String>(imagePathsJson),
      'status': serializer.toJson<String>(status),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'serverRunId': serializer.toJson<String?>(serverRunId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  PendingRequest copyWith({
    String? id,
    String? kind,
    String? payloadJson,
    String? imagePathsJson,
    String? status,
    int? attempts,
    Value<String?> lastError = const Value.absent(),
    Value<String?> serverRunId = const Value.absent(),
    DateTime? createdAt,
  }) => PendingRequest(
    id: id ?? this.id,
    kind: kind ?? this.kind,
    payloadJson: payloadJson ?? this.payloadJson,
    imagePathsJson: imagePathsJson ?? this.imagePathsJson,
    status: status ?? this.status,
    attempts: attempts ?? this.attempts,
    lastError: lastError.present ? lastError.value : this.lastError,
    serverRunId: serverRunId.present ? serverRunId.value : this.serverRunId,
    createdAt: createdAt ?? this.createdAt,
  );
  PendingRequest copyWithCompanion(PendingRequestsCompanion data) {
    return PendingRequest(
      id: data.id.present ? data.id.value : this.id,
      kind: data.kind.present ? data.kind.value : this.kind,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      imagePathsJson: data.imagePathsJson.present
          ? data.imagePathsJson.value
          : this.imagePathsJson,
      status: data.status.present ? data.status.value : this.status,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      serverRunId: data.serverRunId.present
          ? data.serverRunId.value
          : this.serverRunId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingRequest(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('imagePathsJson: $imagePathsJson, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('serverRunId: $serverRunId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    kind,
    payloadJson,
    imagePathsJson,
    status,
    attempts,
    lastError,
    serverRunId,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingRequest &&
          other.id == this.id &&
          other.kind == this.kind &&
          other.payloadJson == this.payloadJson &&
          other.imagePathsJson == this.imagePathsJson &&
          other.status == this.status &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.serverRunId == this.serverRunId &&
          other.createdAt == this.createdAt);
}

class PendingRequestsCompanion extends UpdateCompanion<PendingRequest> {
  final Value<String> id;
  final Value<String> kind;
  final Value<String> payloadJson;
  final Value<String> imagePathsJson;
  final Value<String> status;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<String?> serverRunId;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const PendingRequestsCompanion({
    this.id = const Value.absent(),
    this.kind = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.imagePathsJson = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.serverRunId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingRequestsCompanion.insert({
    required String id,
    required String kind,
    required String payloadJson,
    this.imagePathsJson = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.serverRunId = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       kind = Value(kind),
       payloadJson = Value(payloadJson),
       createdAt = Value(createdAt);
  static Insertable<PendingRequest> custom({
    Expression<String>? id,
    Expression<String>? kind,
    Expression<String>? payloadJson,
    Expression<String>? imagePathsJson,
    Expression<String>? status,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<String>? serverRunId,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (kind != null) 'kind': kind,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (imagePathsJson != null) 'image_paths_json': imagePathsJson,
      if (status != null) 'status': status,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (serverRunId != null) 'server_run_id': serverRunId,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingRequestsCompanion copyWith({
    Value<String>? id,
    Value<String>? kind,
    Value<String>? payloadJson,
    Value<String>? imagePathsJson,
    Value<String>? status,
    Value<int>? attempts,
    Value<String?>? lastError,
    Value<String?>? serverRunId,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return PendingRequestsCompanion(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      payloadJson: payloadJson ?? this.payloadJson,
      imagePathsJson: imagePathsJson ?? this.imagePathsJson,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      serverRunId: serverRunId ?? this.serverRunId,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (imagePathsJson.present) {
      map['image_paths_json'] = Variable<String>(imagePathsJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (serverRunId.present) {
      map['server_run_id'] = Variable<String>(serverRunId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingRequestsCompanion(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('imagePathsJson: $imagePathsJson, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('serverRunId: $serverRunId, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChecklistTicksTable extends ChecklistTicks
    with TableInfo<$ChecklistTicksTable, ChecklistTick> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChecklistTicksTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _analysisIdMeta = const VerificationMeta(
    'analysisId',
  );
  @override
  late final GeneratedColumn<String> analysisId = GeneratedColumn<String>(
    'analysis_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _questionKeyMeta = const VerificationMeta(
    'questionKey',
  );
  @override
  late final GeneratedColumn<String> questionKey = GeneratedColumn<String>(
    'question_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _checkedMeta = const VerificationMeta(
    'checked',
  );
  @override
  late final GeneratedColumn<bool> checked = GeneratedColumn<bool>(
    'checked',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("checked" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [analysisId, questionKey, checked];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'checklist_ticks';
  @override
  VerificationContext validateIntegrity(
    Insertable<ChecklistTick> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('analysis_id')) {
      context.handle(
        _analysisIdMeta,
        analysisId.isAcceptableOrUnknown(data['analysis_id']!, _analysisIdMeta),
      );
    } else if (isInserting) {
      context.missing(_analysisIdMeta);
    }
    if (data.containsKey('question_key')) {
      context.handle(
        _questionKeyMeta,
        questionKey.isAcceptableOrUnknown(
          data['question_key']!,
          _questionKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_questionKeyMeta);
    }
    if (data.containsKey('checked')) {
      context.handle(
        _checkedMeta,
        checked.isAcceptableOrUnknown(data['checked']!, _checkedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {analysisId, questionKey};
  @override
  ChecklistTick map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChecklistTick(
      analysisId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}analysis_id'],
      )!,
      questionKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}question_key'],
      )!,
      checked: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}checked'],
      )!,
    );
  }

  @override
  $ChecklistTicksTable createAlias(String alias) {
    return $ChecklistTicksTable(attachedDatabase, alias);
  }
}

class ChecklistTick extends DataClass implements Insertable<ChecklistTick> {
  final String analysisId;
  final String questionKey;
  final bool checked;
  const ChecklistTick({
    required this.analysisId,
    required this.questionKey,
    required this.checked,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['analysis_id'] = Variable<String>(analysisId);
    map['question_key'] = Variable<String>(questionKey);
    map['checked'] = Variable<bool>(checked);
    return map;
  }

  ChecklistTicksCompanion toCompanion(bool nullToAbsent) {
    return ChecklistTicksCompanion(
      analysisId: Value(analysisId),
      questionKey: Value(questionKey),
      checked: Value(checked),
    );
  }

  factory ChecklistTick.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChecklistTick(
      analysisId: serializer.fromJson<String>(json['analysisId']),
      questionKey: serializer.fromJson<String>(json['questionKey']),
      checked: serializer.fromJson<bool>(json['checked']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'analysisId': serializer.toJson<String>(analysisId),
      'questionKey': serializer.toJson<String>(questionKey),
      'checked': serializer.toJson<bool>(checked),
    };
  }

  ChecklistTick copyWith({
    String? analysisId,
    String? questionKey,
    bool? checked,
  }) => ChecklistTick(
    analysisId: analysisId ?? this.analysisId,
    questionKey: questionKey ?? this.questionKey,
    checked: checked ?? this.checked,
  );
  ChecklistTick copyWithCompanion(ChecklistTicksCompanion data) {
    return ChecklistTick(
      analysisId: data.analysisId.present
          ? data.analysisId.value
          : this.analysisId,
      questionKey: data.questionKey.present
          ? data.questionKey.value
          : this.questionKey,
      checked: data.checked.present ? data.checked.value : this.checked,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChecklistTick(')
          ..write('analysisId: $analysisId, ')
          ..write('questionKey: $questionKey, ')
          ..write('checked: $checked')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(analysisId, questionKey, checked);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChecklistTick &&
          other.analysisId == this.analysisId &&
          other.questionKey == this.questionKey &&
          other.checked == this.checked);
}

class ChecklistTicksCompanion extends UpdateCompanion<ChecklistTick> {
  final Value<String> analysisId;
  final Value<String> questionKey;
  final Value<bool> checked;
  final Value<int> rowid;
  const ChecklistTicksCompanion({
    this.analysisId = const Value.absent(),
    this.questionKey = const Value.absent(),
    this.checked = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ChecklistTicksCompanion.insert({
    required String analysisId,
    required String questionKey,
    this.checked = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : analysisId = Value(analysisId),
       questionKey = Value(questionKey);
  static Insertable<ChecklistTick> custom({
    Expression<String>? analysisId,
    Expression<String>? questionKey,
    Expression<bool>? checked,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (analysisId != null) 'analysis_id': analysisId,
      if (questionKey != null) 'question_key': questionKey,
      if (checked != null) 'checked': checked,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ChecklistTicksCompanion copyWith({
    Value<String>? analysisId,
    Value<String>? questionKey,
    Value<bool>? checked,
    Value<int>? rowid,
  }) {
    return ChecklistTicksCompanion(
      analysisId: analysisId ?? this.analysisId,
      questionKey: questionKey ?? this.questionKey,
      checked: checked ?? this.checked,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (analysisId.present) {
      map['analysis_id'] = Variable<String>(analysisId.value);
    }
    if (questionKey.present) {
      map['question_key'] = Variable<String>(questionKey.value);
    }
    if (checked.present) {
      map['checked'] = Variable<bool>(checked.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChecklistTicksCompanion(')
          ..write('analysisId: $analysisId, ')
          ..write('questionKey: $questionKey, ')
          ..write('checked: $checked, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedTemplatesTable extends CachedTemplates
    with TableInfo<$CachedTemplatesTable, CachedTemplate> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedTemplatesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cuisineIdMeta = const VerificationMeta(
    'cuisineId',
  );
  @override
  late final GeneratedColumn<String> cuisineId = GeneratedColumn<String>(
    'cuisine_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cuisineNameMeta = const VerificationMeta(
    'cuisineName',
  );
  @override
  late final GeneratedColumn<String> cuisineName = GeneratedColumn<String>(
    'cuisine_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _searchKeyMeta = const VerificationMeta(
    'searchKey',
  );
  @override
  late final GeneratedColumn<String> searchKey = GeneratedColumn<String>(
    'search_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
    'source',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _approvedMeta = const VerificationMeta(
    'approved',
  );
  @override
  late final GeneratedColumn<bool> approved = GeneratedColumn<bool>(
    'approved',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("approved" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _usageCountMeta = const VerificationMeta(
    'usageCount',
  );
  @override
  late final GeneratedColumn<int> usageCount = GeneratedColumn<int>(
    'usage_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    cuisineId,
    cuisineName,
    name,
    searchKey,
    source,
    approved,
    usageCount,
    payloadJson,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_templates';
  @override
  VerificationContext validateIntegrity(
    Insertable<CachedTemplate> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('cuisine_id')) {
      context.handle(
        _cuisineIdMeta,
        cuisineId.isAcceptableOrUnknown(data['cuisine_id']!, _cuisineIdMeta),
      );
    } else if (isInserting) {
      context.missing(_cuisineIdMeta);
    }
    if (data.containsKey('cuisine_name')) {
      context.handle(
        _cuisineNameMeta,
        cuisineName.isAcceptableOrUnknown(
          data['cuisine_name']!,
          _cuisineNameMeta,
        ),
      );
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('search_key')) {
      context.handle(
        _searchKeyMeta,
        searchKey.isAcceptableOrUnknown(data['search_key']!, _searchKeyMeta),
      );
    } else if (isInserting) {
      context.missing(_searchKeyMeta);
    }
    if (data.containsKey('source')) {
      context.handle(
        _sourceMeta,
        source.isAcceptableOrUnknown(data['source']!, _sourceMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceMeta);
    }
    if (data.containsKey('approved')) {
      context.handle(
        _approvedMeta,
        approved.isAcceptableOrUnknown(data['approved']!, _approvedMeta),
      );
    }
    if (data.containsKey('usage_count')) {
      context.handle(
        _usageCountMeta,
        usageCount.isAcceptableOrUnknown(data['usage_count']!, _usageCountMeta),
      );
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedTemplate map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedTemplate(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      cuisineId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cuisine_id'],
      )!,
      cuisineName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cuisine_name'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      searchKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}search_key'],
      )!,
      source: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source'],
      )!,
      approved: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}approved'],
      )!,
      usageCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}usage_count'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $CachedTemplatesTable createAlias(String alias) {
    return $CachedTemplatesTable(attachedDatabase, alias);
  }
}

class CachedTemplate extends DataClass implements Insertable<CachedTemplate> {
  final String id;
  final String cuisineId;
  final String cuisineName;
  final String name;
  final String searchKey;
  final String source;
  final bool approved;
  final int usageCount;
  final String payloadJson;
  final DateTime updatedAt;
  const CachedTemplate({
    required this.id,
    required this.cuisineId,
    required this.cuisineName,
    required this.name,
    required this.searchKey,
    required this.source,
    required this.approved,
    required this.usageCount,
    required this.payloadJson,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['cuisine_id'] = Variable<String>(cuisineId);
    map['cuisine_name'] = Variable<String>(cuisineName);
    map['name'] = Variable<String>(name);
    map['search_key'] = Variable<String>(searchKey);
    map['source'] = Variable<String>(source);
    map['approved'] = Variable<bool>(approved);
    map['usage_count'] = Variable<int>(usageCount);
    map['payload_json'] = Variable<String>(payloadJson);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  CachedTemplatesCompanion toCompanion(bool nullToAbsent) {
    return CachedTemplatesCompanion(
      id: Value(id),
      cuisineId: Value(cuisineId),
      cuisineName: Value(cuisineName),
      name: Value(name),
      searchKey: Value(searchKey),
      source: Value(source),
      approved: Value(approved),
      usageCount: Value(usageCount),
      payloadJson: Value(payloadJson),
      updatedAt: Value(updatedAt),
    );
  }

  factory CachedTemplate.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedTemplate(
      id: serializer.fromJson<String>(json['id']),
      cuisineId: serializer.fromJson<String>(json['cuisineId']),
      cuisineName: serializer.fromJson<String>(json['cuisineName']),
      name: serializer.fromJson<String>(json['name']),
      searchKey: serializer.fromJson<String>(json['searchKey']),
      source: serializer.fromJson<String>(json['source']),
      approved: serializer.fromJson<bool>(json['approved']),
      usageCount: serializer.fromJson<int>(json['usageCount']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'cuisineId': serializer.toJson<String>(cuisineId),
      'cuisineName': serializer.toJson<String>(cuisineName),
      'name': serializer.toJson<String>(name),
      'searchKey': serializer.toJson<String>(searchKey),
      'source': serializer.toJson<String>(source),
      'approved': serializer.toJson<bool>(approved),
      'usageCount': serializer.toJson<int>(usageCount),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  CachedTemplate copyWith({
    String? id,
    String? cuisineId,
    String? cuisineName,
    String? name,
    String? searchKey,
    String? source,
    bool? approved,
    int? usageCount,
    String? payloadJson,
    DateTime? updatedAt,
  }) => CachedTemplate(
    id: id ?? this.id,
    cuisineId: cuisineId ?? this.cuisineId,
    cuisineName: cuisineName ?? this.cuisineName,
    name: name ?? this.name,
    searchKey: searchKey ?? this.searchKey,
    source: source ?? this.source,
    approved: approved ?? this.approved,
    usageCount: usageCount ?? this.usageCount,
    payloadJson: payloadJson ?? this.payloadJson,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  CachedTemplate copyWithCompanion(CachedTemplatesCompanion data) {
    return CachedTemplate(
      id: data.id.present ? data.id.value : this.id,
      cuisineId: data.cuisineId.present ? data.cuisineId.value : this.cuisineId,
      cuisineName: data.cuisineName.present
          ? data.cuisineName.value
          : this.cuisineName,
      name: data.name.present ? data.name.value : this.name,
      searchKey: data.searchKey.present ? data.searchKey.value : this.searchKey,
      source: data.source.present ? data.source.value : this.source,
      approved: data.approved.present ? data.approved.value : this.approved,
      usageCount: data.usageCount.present
          ? data.usageCount.value
          : this.usageCount,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedTemplate(')
          ..write('id: $id, ')
          ..write('cuisineId: $cuisineId, ')
          ..write('cuisineName: $cuisineName, ')
          ..write('name: $name, ')
          ..write('searchKey: $searchKey, ')
          ..write('source: $source, ')
          ..write('approved: $approved, ')
          ..write('usageCount: $usageCount, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    cuisineId,
    cuisineName,
    name,
    searchKey,
    source,
    approved,
    usageCount,
    payloadJson,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedTemplate &&
          other.id == this.id &&
          other.cuisineId == this.cuisineId &&
          other.cuisineName == this.cuisineName &&
          other.name == this.name &&
          other.searchKey == this.searchKey &&
          other.source == this.source &&
          other.approved == this.approved &&
          other.usageCount == this.usageCount &&
          other.payloadJson == this.payloadJson &&
          other.updatedAt == this.updatedAt);
}

class CachedTemplatesCompanion extends UpdateCompanion<CachedTemplate> {
  final Value<String> id;
  final Value<String> cuisineId;
  final Value<String> cuisineName;
  final Value<String> name;
  final Value<String> searchKey;
  final Value<String> source;
  final Value<bool> approved;
  final Value<int> usageCount;
  final Value<String> payloadJson;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const CachedTemplatesCompanion({
    this.id = const Value.absent(),
    this.cuisineId = const Value.absent(),
    this.cuisineName = const Value.absent(),
    this.name = const Value.absent(),
    this.searchKey = const Value.absent(),
    this.source = const Value.absent(),
    this.approved = const Value.absent(),
    this.usageCount = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedTemplatesCompanion.insert({
    required String id,
    required String cuisineId,
    this.cuisineName = const Value.absent(),
    required String name,
    required String searchKey,
    required String source,
    this.approved = const Value.absent(),
    this.usageCount = const Value.absent(),
    required String payloadJson,
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       cuisineId = Value(cuisineId),
       name = Value(name),
       searchKey = Value(searchKey),
       source = Value(source),
       payloadJson = Value(payloadJson),
       updatedAt = Value(updatedAt);
  static Insertable<CachedTemplate> custom({
    Expression<String>? id,
    Expression<String>? cuisineId,
    Expression<String>? cuisineName,
    Expression<String>? name,
    Expression<String>? searchKey,
    Expression<String>? source,
    Expression<bool>? approved,
    Expression<int>? usageCount,
    Expression<String>? payloadJson,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (cuisineId != null) 'cuisine_id': cuisineId,
      if (cuisineName != null) 'cuisine_name': cuisineName,
      if (name != null) 'name': name,
      if (searchKey != null) 'search_key': searchKey,
      if (source != null) 'source': source,
      if (approved != null) 'approved': approved,
      if (usageCount != null) 'usage_count': usageCount,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedTemplatesCompanion copyWith({
    Value<String>? id,
    Value<String>? cuisineId,
    Value<String>? cuisineName,
    Value<String>? name,
    Value<String>? searchKey,
    Value<String>? source,
    Value<bool>? approved,
    Value<int>? usageCount,
    Value<String>? payloadJson,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return CachedTemplatesCompanion(
      id: id ?? this.id,
      cuisineId: cuisineId ?? this.cuisineId,
      cuisineName: cuisineName ?? this.cuisineName,
      name: name ?? this.name,
      searchKey: searchKey ?? this.searchKey,
      source: source ?? this.source,
      approved: approved ?? this.approved,
      usageCount: usageCount ?? this.usageCount,
      payloadJson: payloadJson ?? this.payloadJson,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (cuisineId.present) {
      map['cuisine_id'] = Variable<String>(cuisineId.value);
    }
    if (cuisineName.present) {
      map['cuisine_name'] = Variable<String>(cuisineName.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (searchKey.present) {
      map['search_key'] = Variable<String>(searchKey.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (approved.present) {
      map['approved'] = Variable<bool>(approved.value);
    }
    if (usageCount.present) {
      map['usage_count'] = Variable<int>(usageCount.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedTemplatesCompanion(')
          ..write('id: $id, ')
          ..write('cuisineId: $cuisineId, ')
          ..write('cuisineName: $cuisineName, ')
          ..write('name: $name, ')
          ..write('searchKey: $searchKey, ')
          ..write('source: $source, ')
          ..write('approved: $approved, ')
          ..write('usageCount: $usageCount, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $KvEntriesTable kvEntries = $KvEntriesTable(this);
  late final $RecentRunsTable recentRuns = $RecentRunsTable(this);
  late final $PendingRequestsTable pendingRequests = $PendingRequestsTable(
    this,
  );
  late final $ChecklistTicksTable checklistTicks = $ChecklistTicksTable(this);
  late final $CachedTemplatesTable cachedTemplates = $CachedTemplatesTable(
    this,
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    kvEntries,
    recentRuns,
    pendingRequests,
    checklistTicks,
    cachedTemplates,
  ];
}

typedef $$KvEntriesTableCreateCompanionBuilder = KvEntriesCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$KvEntriesTableUpdateCompanionBuilder = KvEntriesCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$KvEntriesTableFilterComposer
    extends Composer<_$AppDatabase, $KvEntriesTable> {
  $$KvEntriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$KvEntriesTableOrderingComposer
    extends Composer<_$AppDatabase, $KvEntriesTable> {
  $$KvEntriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$KvEntriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $KvEntriesTable> {
  $$KvEntriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$KvEntriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $KvEntriesTable,
          KvEntry,
          $$KvEntriesTableFilterComposer,
          $$KvEntriesTableOrderingComposer,
          $$KvEntriesTableAnnotationComposer,
          $$KvEntriesTableCreateCompanionBuilder,
          $$KvEntriesTableUpdateCompanionBuilder,
          (KvEntry, BaseReferences<_$AppDatabase, $KvEntriesTable, KvEntry>),
          KvEntry,
          PrefetchHooks Function()
        > {
  $$KvEntriesTableTableManager(_$AppDatabase db, $KvEntriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KvEntriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KvEntriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KvEntriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => KvEntriesCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) => KvEntriesCompanion.insert(key: key, value: value, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$KvEntriesTable, KvEntry>(table),
                  BaseReferences<_$AppDatabase, $KvEntriesTable, KvEntry>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$KvEntriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $KvEntriesTable,
      KvEntry,
      $$KvEntriesTableFilterComposer,
      $$KvEntriesTableOrderingComposer,
      $$KvEntriesTableAnnotationComposer,
      $$KvEntriesTableCreateCompanionBuilder,
      $$KvEntriesTableUpdateCompanionBuilder,
      (KvEntry, BaseReferences<_$AppDatabase, $KvEntriesTable, KvEntry>),
      KvEntry,
      PrefetchHooks Function()
    >;
typedef $$RecentRunsTableCreateCompanionBuilder = RecentRunsCompanion Function({
  required String runId,
  Value<String?> cuisineId,
  Value<String> cuisineName,
  Value<String> title,
  required String status,
  Value<int> cardCount,
  required String snapshotJson,
  required DateTime createdAt,
  Value<String?> mode,
  Value<DateTime?> finishedAt,
  Value<String> productNamesJson,
  Value<int> menuCount,
  Value<int> newCount,
  Value<int> menuCardCount,
  Value<int> acceptedCount,
  Value<int> skippedCount,
  Value<int?> currentCount,
  Value<int?> targetCount,
  Value<int> laterCount,
  Value<int> rowid,
});
typedef $$RecentRunsTableUpdateCompanionBuilder = RecentRunsCompanion Function({
  Value<String> runId,
  Value<String?> cuisineId,
  Value<String> cuisineName,
  Value<String> title,
  Value<String> status,
  Value<int> cardCount,
  Value<String> snapshotJson,
  Value<DateTime> createdAt,
  Value<String?> mode,
  Value<DateTime?> finishedAt,
  Value<String> productNamesJson,
  Value<int> menuCount,
  Value<int> newCount,
  Value<int> menuCardCount,
  Value<int> acceptedCount,
  Value<int> skippedCount,
  Value<int?> currentCount,
  Value<int?> targetCount,
  Value<int> laterCount,
  Value<int> rowid,
});

class $$RecentRunsTableFilterComposer
    extends Composer<_$AppDatabase, $RecentRunsTable> {
  $$RecentRunsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get runId => $composableBuilder(
    column: $table.runId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cuisineId => $composableBuilder(
    column: $table.cuisineId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get cardCount => $composableBuilder(
    column: $table.cardCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get snapshotJson => $composableBuilder(
    column: $table.snapshotJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mode => $composableBuilder(
    column: $table.mode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get finishedAt => $composableBuilder(
    column: $table.finishedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productNamesJson => $composableBuilder(
    column: $table.productNamesJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get menuCount => $composableBuilder(
    column: $table.menuCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get newCount => $composableBuilder(
    column: $table.newCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get menuCardCount => $composableBuilder(
    column: $table.menuCardCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get acceptedCount => $composableBuilder(
    column: $table.acceptedCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get skippedCount => $composableBuilder(
    column: $table.skippedCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get currentCount => $composableBuilder(
    column: $table.currentCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get targetCount => $composableBuilder(
    column: $table.targetCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get laterCount => $composableBuilder(
    column: $table.laterCount,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RecentRunsTableOrderingComposer
    extends Composer<_$AppDatabase, $RecentRunsTable> {
  $$RecentRunsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get runId => $composableBuilder(
    column: $table.runId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cuisineId => $composableBuilder(
    column: $table.cuisineId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get cardCount => $composableBuilder(
    column: $table.cardCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get snapshotJson => $composableBuilder(
    column: $table.snapshotJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mode => $composableBuilder(
    column: $table.mode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get finishedAt => $composableBuilder(
    column: $table.finishedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productNamesJson => $composableBuilder(
    column: $table.productNamesJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get menuCount => $composableBuilder(
    column: $table.menuCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get newCount => $composableBuilder(
    column: $table.newCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get menuCardCount => $composableBuilder(
    column: $table.menuCardCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get acceptedCount => $composableBuilder(
    column: $table.acceptedCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get skippedCount => $composableBuilder(
    column: $table.skippedCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get currentCount => $composableBuilder(
    column: $table.currentCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get targetCount => $composableBuilder(
    column: $table.targetCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get laterCount => $composableBuilder(
    column: $table.laterCount,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RecentRunsTableAnnotationComposer
    extends Composer<_$AppDatabase, $RecentRunsTable> {
  $$RecentRunsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get runId =>
      $composableBuilder(column: $table.runId, builder: (column) => column);

  GeneratedColumn<String> get cuisineId =>
      $composableBuilder(column: $table.cuisineId, builder: (column) => column);

  GeneratedColumn<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get cardCount =>
      $composableBuilder(column: $table.cardCount, builder: (column) => column);

  GeneratedColumn<String> get snapshotJson => $composableBuilder(
    column: $table.snapshotJson,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get mode =>
      $composableBuilder(column: $table.mode, builder: (column) => column);

  GeneratedColumn<DateTime> get finishedAt => $composableBuilder(
    column: $table.finishedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get productNamesJson => $composableBuilder(
    column: $table.productNamesJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get menuCount =>
      $composableBuilder(column: $table.menuCount, builder: (column) => column);

  GeneratedColumn<int> get newCount =>
      $composableBuilder(column: $table.newCount, builder: (column) => column);

  GeneratedColumn<int> get menuCardCount => $composableBuilder(
    column: $table.menuCardCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get acceptedCount => $composableBuilder(
    column: $table.acceptedCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get skippedCount => $composableBuilder(
    column: $table.skippedCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get currentCount => $composableBuilder(
    column: $table.currentCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get targetCount => $composableBuilder(
    column: $table.targetCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get laterCount => $composableBuilder(
    column: $table.laterCount,
    builder: (column) => column,
  );
}

class $$RecentRunsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RecentRunsTable,
          RecentRun,
          $$RecentRunsTableFilterComposer,
          $$RecentRunsTableOrderingComposer,
          $$RecentRunsTableAnnotationComposer,
          $$RecentRunsTableCreateCompanionBuilder,
          $$RecentRunsTableUpdateCompanionBuilder,
          (
            RecentRun,
            BaseReferences<_$AppDatabase, $RecentRunsTable, RecentRun>,
          ),
          RecentRun,
          PrefetchHooks Function()
        > {
  $$RecentRunsTableTableManager(_$AppDatabase db, $RecentRunsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RecentRunsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RecentRunsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RecentRunsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> runId = const Value.absent(),
                Value<String?> cuisineId = const Value.absent(),
                Value<String> cuisineName = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> cardCount = const Value.absent(),
                Value<String> snapshotJson = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<String?> mode = const Value.absent(),
                Value<DateTime?> finishedAt = const Value.absent(),
                Value<String> productNamesJson = const Value.absent(),
                Value<int> menuCount = const Value.absent(),
                Value<int> newCount = const Value.absent(),
                Value<int> menuCardCount = const Value.absent(),
                Value<int> acceptedCount = const Value.absent(),
                Value<int> skippedCount = const Value.absent(),
                Value<int?> currentCount = const Value.absent(),
                Value<int?> targetCount = const Value.absent(),
                Value<int> laterCount = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RecentRunsCompanion(
                runId: runId,
                cuisineId: cuisineId,
                cuisineName: cuisineName,
                title: title,
                status: status,
                cardCount: cardCount,
                snapshotJson: snapshotJson,
                createdAt: createdAt,
                mode: mode,
                finishedAt: finishedAt,
                productNamesJson: productNamesJson,
                menuCount: menuCount,
                newCount: newCount,
                menuCardCount: menuCardCount,
                acceptedCount: acceptedCount,
                skippedCount: skippedCount,
                currentCount: currentCount,
                targetCount: targetCount,
                laterCount: laterCount,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String runId,
                Value<String?> cuisineId = const Value.absent(),
                Value<String> cuisineName = const Value.absent(),
                Value<String> title = const Value.absent(),
                required String status,
                Value<int> cardCount = const Value.absent(),
                required String snapshotJson,
                required DateTime createdAt,
                Value<String?> mode = const Value.absent(),
                Value<DateTime?> finishedAt = const Value.absent(),
                Value<String> productNamesJson = const Value.absent(),
                Value<int> menuCount = const Value.absent(),
                Value<int> newCount = const Value.absent(),
                Value<int> menuCardCount = const Value.absent(),
                Value<int> acceptedCount = const Value.absent(),
                Value<int> skippedCount = const Value.absent(),
                Value<int?> currentCount = const Value.absent(),
                Value<int?> targetCount = const Value.absent(),
                Value<int> laterCount = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RecentRunsCompanion.insert(
                runId: runId,
                cuisineId: cuisineId,
                cuisineName: cuisineName,
                title: title,
                status: status,
                cardCount: cardCount,
                snapshotJson: snapshotJson,
                createdAt: createdAt,
                mode: mode,
                finishedAt: finishedAt,
                productNamesJson: productNamesJson,
                menuCount: menuCount,
                newCount: newCount,
                menuCardCount: menuCardCount,
                acceptedCount: acceptedCount,
                skippedCount: skippedCount,
                currentCount: currentCount,
                targetCount: targetCount,
                laterCount: laterCount,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$RecentRunsTable, RecentRun>(table),
                  BaseReferences<_$AppDatabase, $RecentRunsTable, RecentRun>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RecentRunsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RecentRunsTable,
      RecentRun,
      $$RecentRunsTableFilterComposer,
      $$RecentRunsTableOrderingComposer,
      $$RecentRunsTableAnnotationComposer,
      $$RecentRunsTableCreateCompanionBuilder,
      $$RecentRunsTableUpdateCompanionBuilder,
      (RecentRun, BaseReferences<_$AppDatabase, $RecentRunsTable, RecentRun>),
      RecentRun,
      PrefetchHooks Function()
    >;
typedef $$PendingRequestsTableCreateCompanionBuilder =
    PendingRequestsCompanion Function({
      required String id,
      required String kind,
      required String payloadJson,
      Value<String> imagePathsJson,
      Value<String> status,
      Value<int> attempts,
      Value<String?> lastError,
      Value<String?> serverRunId,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$PendingRequestsTableUpdateCompanionBuilder =
    PendingRequestsCompanion Function({
      Value<String> id,
      Value<String> kind,
      Value<String> payloadJson,
      Value<String> imagePathsJson,
      Value<String> status,
      Value<int> attempts,
      Value<String?> lastError,
      Value<String?> serverRunId,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

class $$PendingRequestsTableFilterComposer
    extends Composer<_$AppDatabase, $PendingRequestsTable> {
  $$PendingRequestsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imagePathsJson => $composableBuilder(
    column: $table.imagePathsJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverRunId => $composableBuilder(
    column: $table.serverRunId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PendingRequestsTableOrderingComposer
    extends Composer<_$AppDatabase, $PendingRequestsTable> {
  $$PendingRequestsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imagePathsJson => $composableBuilder(
    column: $table.imagePathsJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverRunId => $composableBuilder(
    column: $table.serverRunId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PendingRequestsTableAnnotationComposer
    extends Composer<_$AppDatabase, $PendingRequestsTable> {
  $$PendingRequestsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imagePathsJson => $composableBuilder(
    column: $table.imagePathsJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<String> get serverRunId => $composableBuilder(
    column: $table.serverRunId,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$PendingRequestsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PendingRequestsTable,
          PendingRequest,
          $$PendingRequestsTableFilterComposer,
          $$PendingRequestsTableOrderingComposer,
          $$PendingRequestsTableAnnotationComposer,
          $$PendingRequestsTableCreateCompanionBuilder,
          $$PendingRequestsTableUpdateCompanionBuilder,
          (
            PendingRequest,
            BaseReferences<
              _$AppDatabase,
              $PendingRequestsTable,
              PendingRequest
            >,
          ),
          PendingRequest,
          PrefetchHooks Function()
        > {
  $$PendingRequestsTableTableManager(
    _$AppDatabase db,
    $PendingRequestsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PendingRequestsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PendingRequestsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PendingRequestsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<String> imagePathsJson = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String?> serverRunId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingRequestsCompanion(
                id: id,
                kind: kind,
                payloadJson: payloadJson,
                imagePathsJson: imagePathsJson,
                status: status,
                attempts: attempts,
                lastError: lastError,
                serverRunId: serverRunId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String kind,
                required String payloadJson,
                Value<String> imagePathsJson = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String?> serverRunId = const Value.absent(),
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => PendingRequestsCompanion.insert(
                id: id,
                kind: kind,
                payloadJson: payloadJson,
                imagePathsJson: imagePathsJson,
                status: status,
                attempts: attempts,
                lastError: lastError,
                serverRunId: serverRunId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$PendingRequestsTable, PendingRequest>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $PendingRequestsTable,
                    PendingRequest
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PendingRequestsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PendingRequestsTable,
      PendingRequest,
      $$PendingRequestsTableFilterComposer,
      $$PendingRequestsTableOrderingComposer,
      $$PendingRequestsTableAnnotationComposer,
      $$PendingRequestsTableCreateCompanionBuilder,
      $$PendingRequestsTableUpdateCompanionBuilder,
      (
        PendingRequest,
        BaseReferences<_$AppDatabase, $PendingRequestsTable, PendingRequest>,
      ),
      PendingRequest,
      PrefetchHooks Function()
    >;
typedef $$ChecklistTicksTableCreateCompanionBuilder =
    ChecklistTicksCompanion Function({
      required String analysisId,
      required String questionKey,
      Value<bool> checked,
      Value<int> rowid,
    });
typedef $$ChecklistTicksTableUpdateCompanionBuilder =
    ChecklistTicksCompanion Function({
      Value<String> analysisId,
      Value<String> questionKey,
      Value<bool> checked,
      Value<int> rowid,
    });

class $$ChecklistTicksTableFilterComposer
    extends Composer<_$AppDatabase, $ChecklistTicksTable> {
  $$ChecklistTicksTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get analysisId => $composableBuilder(
    column: $table.analysisId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get checked => $composableBuilder(
    column: $table.checked,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ChecklistTicksTableOrderingComposer
    extends Composer<_$AppDatabase, $ChecklistTicksTable> {
  $$ChecklistTicksTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get analysisId => $composableBuilder(
    column: $table.analysisId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get checked => $composableBuilder(
    column: $table.checked,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ChecklistTicksTableAnnotationComposer
    extends Composer<_$AppDatabase, $ChecklistTicksTable> {
  $$ChecklistTicksTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get analysisId => $composableBuilder(
    column: $table.analysisId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get checked =>
      $composableBuilder(column: $table.checked, builder: (column) => column);
}

class $$ChecklistTicksTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ChecklistTicksTable,
          ChecklistTick,
          $$ChecklistTicksTableFilterComposer,
          $$ChecklistTicksTableOrderingComposer,
          $$ChecklistTicksTableAnnotationComposer,
          $$ChecklistTicksTableCreateCompanionBuilder,
          $$ChecklistTicksTableUpdateCompanionBuilder,
          (
            ChecklistTick,
            BaseReferences<_$AppDatabase, $ChecklistTicksTable, ChecklistTick>,
          ),
          ChecklistTick,
          PrefetchHooks Function()
        > {
  $$ChecklistTicksTableTableManager(
    _$AppDatabase db,
    $ChecklistTicksTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ChecklistTicksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ChecklistTicksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ChecklistTicksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> analysisId = const Value.absent(),
                Value<String> questionKey = const Value.absent(),
                Value<bool> checked = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ChecklistTicksCompanion(
                analysisId: analysisId,
                questionKey: questionKey,
                checked: checked,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String analysisId,
                required String questionKey,
                Value<bool> checked = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ChecklistTicksCompanion.insert(
                analysisId: analysisId,
                questionKey: questionKey,
                checked: checked,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ChecklistTicksTable, ChecklistTick>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $ChecklistTicksTable,
                    ChecklistTick
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ChecklistTicksTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ChecklistTicksTable,
      ChecklistTick,
      $$ChecklistTicksTableFilterComposer,
      $$ChecklistTicksTableOrderingComposer,
      $$ChecklistTicksTableAnnotationComposer,
      $$ChecklistTicksTableCreateCompanionBuilder,
      $$ChecklistTicksTableUpdateCompanionBuilder,
      (
        ChecklistTick,
        BaseReferences<_$AppDatabase, $ChecklistTicksTable, ChecklistTick>,
      ),
      ChecklistTick,
      PrefetchHooks Function()
    >;
typedef $$CachedTemplatesTableCreateCompanionBuilder =
    CachedTemplatesCompanion Function({
      required String id,
      required String cuisineId,
      Value<String> cuisineName,
      required String name,
      required String searchKey,
      required String source,
      Value<bool> approved,
      Value<int> usageCount,
      required String payloadJson,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$CachedTemplatesTableUpdateCompanionBuilder =
    CachedTemplatesCompanion Function({
      Value<String> id,
      Value<String> cuisineId,
      Value<String> cuisineName,
      Value<String> name,
      Value<String> searchKey,
      Value<String> source,
      Value<bool> approved,
      Value<int> usageCount,
      Value<String> payloadJson,
      Value<DateTime> updatedAt,
      Value<int> rowid,
    });

class $$CachedTemplatesTableFilterComposer
    extends Composer<_$AppDatabase, $CachedTemplatesTable> {
  $$CachedTemplatesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cuisineId => $composableBuilder(
    column: $table.cuisineId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get searchKey => $composableBuilder(
    column: $table.searchKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get approved => $composableBuilder(
    column: $table.approved,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get usageCount => $composableBuilder(
    column: $table.usageCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CachedTemplatesTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedTemplatesTable> {
  $$CachedTemplatesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cuisineId => $composableBuilder(
    column: $table.cuisineId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get searchKey => $composableBuilder(
    column: $table.searchKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get approved => $composableBuilder(
    column: $table.approved,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get usageCount => $composableBuilder(
    column: $table.usageCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CachedTemplatesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedTemplatesTable> {
  $$CachedTemplatesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get cuisineId =>
      $composableBuilder(column: $table.cuisineId, builder: (column) => column);

  GeneratedColumn<String> get cuisineName => $composableBuilder(
    column: $table.cuisineName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get searchKey =>
      $composableBuilder(column: $table.searchKey, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<bool> get approved =>
      $composableBuilder(column: $table.approved, builder: (column) => column);

  GeneratedColumn<int> get usageCount => $composableBuilder(
    column: $table.usageCount,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$CachedTemplatesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CachedTemplatesTable,
          CachedTemplate,
          $$CachedTemplatesTableFilterComposer,
          $$CachedTemplatesTableOrderingComposer,
          $$CachedTemplatesTableAnnotationComposer,
          $$CachedTemplatesTableCreateCompanionBuilder,
          $$CachedTemplatesTableUpdateCompanionBuilder,
          (
            CachedTemplate,
            BaseReferences<
              _$AppDatabase,
              $CachedTemplatesTable,
              CachedTemplate
            >,
          ),
          CachedTemplate,
          PrefetchHooks Function()
        > {
  $$CachedTemplatesTableTableManager(
    _$AppDatabase db,
    $CachedTemplatesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedTemplatesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedTemplatesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedTemplatesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> cuisineId = const Value.absent(),
                Value<String> cuisineName = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> searchKey = const Value.absent(),
                Value<String> source = const Value.absent(),
                Value<bool> approved = const Value.absent(),
                Value<int> usageCount = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CachedTemplatesCompanion(
                id: id,
                cuisineId: cuisineId,
                cuisineName: cuisineName,
                name: name,
                searchKey: searchKey,
                source: source,
                approved: approved,
                usageCount: usageCount,
                payloadJson: payloadJson,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String cuisineId,
                Value<String> cuisineName = const Value.absent(),
                required String name,
                required String searchKey,
                required String source,
                Value<bool> approved = const Value.absent(),
                Value<int> usageCount = const Value.absent(),
                required String payloadJson,
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => CachedTemplatesCompanion.insert(
                id: id,
                cuisineId: cuisineId,
                cuisineName: cuisineName,
                name: name,
                searchKey: searchKey,
                source: source,
                approved: approved,
                usageCount: usageCount,
                payloadJson: payloadJson,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CachedTemplatesTable, CachedTemplate>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $CachedTemplatesTable,
                    CachedTemplate
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CachedTemplatesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CachedTemplatesTable,
      CachedTemplate,
      $$CachedTemplatesTableFilterComposer,
      $$CachedTemplatesTableOrderingComposer,
      $$CachedTemplatesTableAnnotationComposer,
      $$CachedTemplatesTableCreateCompanionBuilder,
      $$CachedTemplatesTableUpdateCompanionBuilder,
      (
        CachedTemplate,
        BaseReferences<_$AppDatabase, $CachedTemplatesTable, CachedTemplate>,
      ),
      CachedTemplate,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$KvEntriesTableTableManager get kvEntries =>
      $$KvEntriesTableTableManager(_db, _db.kvEntries);
  $$RecentRunsTableTableManager get recentRuns =>
      $$RecentRunsTableTableManager(_db, _db.recentRuns);
  $$PendingRequestsTableTableManager get pendingRequests =>
      $$PendingRequestsTableTableManager(_db, _db.pendingRequests);
  $$ChecklistTicksTableTableManager get checklistTicks =>
      $$ChecklistTicksTableTableManager(_db, _db.checklistTicks);
  $$CachedTemplatesTableTableManager get cachedTemplates =>
      $$CachedTemplatesTableTableManager(_db, _db.cachedTemplates);
}
