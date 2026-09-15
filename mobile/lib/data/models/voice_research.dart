import 'json.dart';

/// Voice note → text (Groq Whisper on the server) and the product names parsed from it.
class Transcription {
  const Transcription({required this.text, this.items = const [], this.cached = false, this.durationSec});

  factory Transcription.fromJson(Json json) => Transcription(
        text: json.str('text'),
        items: json.strings('items'),
        cached: json.boolean('cached'),
        durationSec: json.dbl('durationSec'),
      );

  final String text;
  final List<String> items;
  final bool cached;
  final double? durationSec;
}

class WebSource {
  const WebSource({required this.title, required this.url});

  factory WebSource.fromJson(Json json) => WebSource(title: json.str('title'), url: json.str('url'));

  final String title;
  final String url;

  String get host => Uri.tryParse(url)?.host ?? url;

  Json toJson() => {'title': title, 'url': url};
}

class ResearchItem {
  const ResearchItem({required this.name, this.section, this.matchedTemplateId, this.templateName, this.onMenu});

  factory ResearchItem.fromJson(Json json) => ResearchItem(
        name: json.str('name'),
        section: json.strOrNull('section'),
        matchedTemplateId: json.strOrNull('matchedTemplateId'),
        templateName: json.strOrNull('templateName'),
        onMenu: json['onMenu'] is bool ? json['onMenu'] as bool : null,
      );

  final String name;
  final String? section;
  final String? matchedTemplateId;
  final String? templateName;

  /// null when the research was not done for a branch.
  final bool? onMenu;

  Json toJson() => {
        'name': name,
        'section': section,
        'matchedTemplateId': matchedTemplateId,
        'templateName': templateName,
        'onMenu': onMenu,
      };
}

/// "İnternette araştır" result: the restaurant's menu found on the web (no prices, no contact details).
class ResearchResult {
  const ResearchResult({
    required this.restaurantName,
    required this.found,
    this.city,
    this.summary = '',
    this.cuisine,
    this.confidence = 0,
    this.items = const [],
    this.sources = const [],
    this.cached = false,
    this.researchedAt,
  });

  factory ResearchResult.fromJson(Json json) => ResearchResult(
        restaurantName: json.str('restaurantName'),
        city: json.strOrNull('city'),
        found: json.boolean('found'),
        summary: json.str('summary'),
        cuisine: json.strOrNull('cuisine'),
        confidence: json.dbl('confidence') ?? 0,
        items: json.objects('items').map(ResearchItem.fromJson).toList(),
        sources: json.objects('sources').map(WebSource.fromJson).toList(),
        cached: json.boolean('cached'),
        researchedAt: DateTime.tryParse(json.str('researchedAt')),
      );

  final String restaurantName;
  final String? city;
  final bool found;
  final String summary;
  final String? cuisine;
  final double confidence;
  final List<ResearchItem> items;
  final List<WebSource> sources;
  final bool cached;
  final DateTime? researchedAt;

  List<ResearchItem> get notOnMenu => items.where((i) => i.onMenu == false).toList();

  Json toJson() => {
        'restaurantName': restaurantName,
        'city': city,
        'found': found,
        'summary': summary,
        'cuisine': cuisine,
        'confidence': confidence,
        'items': items.map((i) => i.toJson()).toList(),
        'sources': sources.map((s) => s.toJson()).toList(),
        'cached': cached,
        'researchedAt': researchedAt?.toIso8601String(),
      };
}
