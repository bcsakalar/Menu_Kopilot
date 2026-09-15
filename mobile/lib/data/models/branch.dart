import 'package:collection/collection.dart';

import 'json.dart';
import 'template_payload.dart';

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

/// Branch statuses (wire values) in display order.
const List<String> branchStatuses = ['draft', 'in_progress', 'ready', 'opened'];

enum MenuItemStatus {
  ok,
  incomplete,
  missing;

  static MenuItemStatus fromWire(String value) =>
      MenuItemStatus.values.firstWhereOrNull((s) => s.name == value) ?? MenuItemStatus.incomplete;
}

/// A product of the branch menu: on the menu (ok / incomplete) or recommended (missing).
class BranchMenuItem {
  const BranchMenuItem({
    required this.id,
    required this.name,
    required this.status,
    required this.source,
    this.completeness = 0,
    this.missingFields = const [],
    this.reason,
    this.matchedTemplateId,
    this.payload,
    this.templatePayload,
  });

  factory BranchMenuItem.fromJson(Json json) => BranchMenuItem(
        id: json.str('id'),
        name: json.str('name'),
        status: MenuItemStatus.fromWire(json.str('status')),
        source: json.str('source'),
        completeness: json.dbl('completeness') ?? 0,
        missingFields: json.strings('missingFields'),
        reason: json.strOrNull('reason'),
        matchedTemplateId: json.strOrNull('matchedTemplateId'),
        payload: json.object('payload') == null ? null : TemplatePayload.fromJson(json.object('payload')!),
        templatePayload: json.object('templatePayload') == null ? null : TemplatePayload.fromJson(json.object('templatePayload')!),
      );

  final String id;
  final String name;
  final MenuItemStatus status;

  /// screenshot | suggestion | recommendation | manual
  final String source;
  final double completeness;

  /// description | options | removables
  final List<String> missingFields;
  final String? reason;
  final String? matchedTemplateId;

  /// Accepted card frozen for the branch.
  final TemplatePayload? payload;

  /// Matched template content when no card was accepted yet.
  final TemplatePayload? templatePayload;

  TemplatePayload? get content => payload ?? templatePayload;
}

class BranchMenu {
  const BranchMenu({required this.branch, required this.items});

  factory BranchMenu.fromJson(Json json) => BranchMenu(
        branch: Branch.fromJson(json.object('branch') ?? const {}),
        items: json.objects('items').map(BranchMenuItem.fromJson).toList(),
      );

  final Branch branch;
  final List<BranchMenuItem> items;

  List<BranchMenuItem> withStatus(MenuItemStatus status) =>
      items.where((i) => i.status == status).sortedBy((i) => i.name.toLowerCase());
}
