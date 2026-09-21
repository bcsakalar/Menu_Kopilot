import 'json.dart';
import 'analysis.dart';
import 'template_payload.dart';

/// A template of the pool ("Şablon havuzu"). `source`: seed | user | ai | imported.
class TemplateItem {
  const TemplateItem({
    required this.id,
    required this.cuisineId,
    required this.name,
    required this.source,
    required this.payload,
    this.cuisineName = '',
    this.approved = true,
    this.needsReview = false,
    this.importance = 0,
    this.usageCount = 0,
    this.aliases = const [],
    this.updatedAt,
  });

  factory TemplateItem.fromJson(Json json) => TemplateItem(
        id: json.str('id'),
        cuisineId: json.str('cuisineId'),
        cuisineName: json.str('cuisineName'),
        name: json.str('name'),
        source: json.str('source', 'user'),
        approved: json.boolean('approved', true),
        needsReview: json.boolean('needsReview'),
        importance: json.integer('importance'),
        usageCount: json.integer('usageCount'),
        aliases: json.strings('aliases'),
        payload: TemplatePayload.fromJson(json.object('payload') ?? const {}),
        updatedAt: DateTime.tryParse(json.str('updatedAt')),
      );

  final String id;
  final String cuisineId;
  final String cuisineName;
  final String name;
  final String source;
  final bool approved;
  final bool needsReview;
  final int importance;
  final int usageCount;
  final List<String> aliases;
  final TemplatePayload payload;
  final DateTime? updatedAt;

  /// Badge: seed templates are "Hazır şablon", user-approved ones "DB'den", drafts "AI".
  CardOrigin get origin => switch (source) {
        'seed' => CardOrigin.seed,
        'ai' when !approved => CardOrigin.ai,
        _ => CardOrigin.db,
      };

  Json toJson() => {
        'id': id,
        'cuisineId': cuisineId,
        'cuisineName': cuisineName,
        'name': name,
        'source': source,
        'approved': approved,
        'needsReview': needsReview,
        'importance': importance,
        'usageCount': usageCount,
        'aliases': aliases,
        'payload': payload.toJson(),
        'updatedAt': updatedAt?.toIso8601String(),
      };
}
