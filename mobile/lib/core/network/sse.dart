import 'dart:convert';

import '../../data/models/json.dart';

class SseMessage {
  const SseMessage(this.event, this.data);
  final String event;
  final Json data;
}

/// Incremental Server-Sent Events parser: feed it text chunks in any split, get complete messages out.
class SseParser {
  final StringBuffer _buffer = StringBuffer();

  List<SseMessage> add(String chunk) {
    _buffer.write(chunk.replaceAll('\r\n', '\n'));
    final text = _buffer.toString();
    final lastBreak = text.lastIndexOf('\n\n');
    if (lastBreak < 0) return const [];
    final complete = text.substring(0, lastBreak);
    _buffer
      ..clear()
      ..write(text.substring(lastBreak + 2));
    return complete.split('\n\n').map(_parseBlock).whereType<SseMessage>().toList();
  }

  SseMessage? _parseBlock(String block) {
    String? event;
    final data = <String>[];
    for (final line in block.split('\n')) {
      if (line.isEmpty || line.startsWith(':')) continue; // comments / heartbeats
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data.add(line.substring(5).trimLeft());
      }
    }
    if (event == null || data.isEmpty) return null;
    try {
      final decoded = jsonDecode(data.join('\n'));
      return SseMessage(event, asJson(decoded));
    } on FormatException {
      return null;
    }
  }
}
