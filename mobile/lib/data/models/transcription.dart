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
