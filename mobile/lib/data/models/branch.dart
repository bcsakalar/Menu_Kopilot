import 'json.dart';

/// A branch (restaurant) being opened. `effectiveTarget` = manual target or max(10, cuisine minimum).
class Branch {
  const Branch({
    required this.id,
    required this.name,
    required this.cuisineId,
    this.cuisineName = '',
    this.city,
    this.status = 'in_progress',
    this.notes,
    this.targetItemCount,
    this.effectiveTarget = 10,
    this.currentItemCount = 0,
    this.missingCount = 0,
    this.recommendedCount = 0,
    this.lastGapAt,
    this.updatedAt,
  });

  factory Branch.fromJson(Json json) => Branch(
        id: json.str('id'),
        name: json.str('name'),
        cuisineId: json.str('cuisineId'),
        cuisineName: json.str('cuisineName'),
        city: json.strOrNull('city'),
        status: json.str('status', 'in_progress'),
        notes: json.strOrNull('notes'),
        targetItemCount: json.intOrNull('targetItemCount'),
        effectiveTarget: json.integer('effectiveTarget', 10),
        currentItemCount: json.integer('currentItemCount'),
        missingCount: json.integer('missingCount'),
        recommendedCount: json.integer('recommendedCount'),
        lastGapAt: DateTime.tryParse(json.str('lastGapAt')),
        updatedAt: DateTime.tryParse(json.str('updatedAt')),
      );

  final String id;
  final String name;
  final String cuisineId;
  final String cuisineName;
  final String? city;
  final String status;
  final String? notes;
  final int? targetItemCount;
  final int effectiveTarget;
  final int currentItemCount;
  final int missingCount;
  final int recommendedCount;
  final DateTime? lastGapAt;
  final DateTime? updatedAt;

  Json toJson() => {
        'id': id,
        'name': name,
        'cuisineId': cuisineId,
        'cuisineName': cuisineName,
        'city': city,
        'status': status,
        'notes': notes,
        'targetItemCount': targetItemCount,
        'effectiveTarget': effectiveTarget,
        'currentItemCount': currentItemCount,
        'missingCount': missingCount,
        'recommendedCount': recommendedCount,
        'lastGapAt': lastGapAt?.toIso8601String(),
        'updatedAt': updatedAt?.toIso8601String(),
      };
}
