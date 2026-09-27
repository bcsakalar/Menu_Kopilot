import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/storage/app_database.dart';
import '../../data/models/json.dart';
import '../../data/models/template_payload.dart';

/// Offline request queue: analyses / accepts / skips made without a connection are stored in SQLite (images
/// copied into the app's documents folder) and sent later — by the app on reconnect or by the background worker.
class PendingQueue {
  PendingQueue(this._db, {this.storageDir});

  final AppDatabase _db;

  /// Where queued photos are copied so they survive until sent (app documents folder).
  final Future<Directory> Function()? storageDir;
  static const _uuid = Uuid();

  Future<String> enqueueAnalyze(AnalyzeRequestData request, {String cuisineName = ''}) async {
    final id = _uuid.v4();
    final images = <UploadImage>[];
    final dirFactory = storageDir;
    final dir = dirFactory == null ? null : await dirFactory();
    for (final image in request.images) {
      if (dir == null) {
        images.add(image);
        continue;
      }
      final target = Directory(p.join(dir.path, 'pending', id));
      await target.create(recursive: true);
      final copy = await File(image.path).copy(p.join(target.path, '${image.sha256}.jpg'));
      images.add(UploadImage(path: copy.path, sha256: image.sha256));
    }
    final stored = AnalyzeRequestData(
      cuisineId: request.cuisineId,
      menuText: request.menuText,
      notes: request.notes,
      mode: request.mode,
      debug: request.debug,
      images: images,
      fromRunId: request.fromRunId,
    );
    await _db.into(_db.pendingRequests).insert(
          PendingRequestsCompanion.insert(
            id: id,
            kind: 'analyze',
            payloadJson: jsonEncode({...stored.toJson(), 'cuisineName': cuisineName}),
            imagePathsJson: Value(jsonEncode(images.map((i) => i.path).toList())),
            createdAt: DateTime.now(),
          ),
        );
    return id;
  }

  /// "Evet" (and a note ticked off).
  Future<void> enqueueAccept(String itemId, {TemplatePayload? payload}) =>
      _enqueueAnswer('accept', itemId, {'payload': payload?.toJson()});

  /// "Hayır".
  Future<void> enqueueSkip(String itemId) => _enqueueAnswer('skip', itemId, const {});

  /// "Düşünecek".
  Future<void> enqueueLater(String itemId) => _enqueueAnswer('later', itemId, const {});

  static const _answerKinds = ['accept', 'skip', 'later'];

  /// The seller's answers (D-196): only the last one for a card waits in the queue. An answer changed while offline
  /// ("Düşünecek", then "Evet" a few seconds later) must reach the server as the phone shows it — two requests made
  /// within the same second have no order the queue could rely on.
  Future<void> _enqueueAnswer(String kind, String itemId, Map<String, Object?> extra) => _db.transaction(() async {
        final waiting = await (_db.select(_db.pendingRequests)
              ..where((t) => t.status.equals('queued') & t.kind.isIn(_answerKinds)))
            .get();
        for (final row in waiting) {
          if (asJson(jsonDecode(row.payloadJson)).str('itemId') != itemId) continue;
          await (_db.delete(_db.pendingRequests)..where((t) => t.id.equals(row.id))).go();
        }
        await _db.into(_db.pendingRequests).insert(
              PendingRequestsCompanion.insert(
                id: _uuid.v4(),
                kind: kind,
                payloadJson: jsonEncode({'itemId': itemId, ...extra}),
                createdAt: DateTime.now(),
              ),
            );
      });

  /// Sends queued requests in order. Stops at the first network error (still offline). Returns how many were sent.
  Future<int> flush(ApiClient api) async {
    var sent = 0;
    for (final request in await _db.queuedRequests()) {
      final data = asJson(jsonDecode(request.payloadJson));
      try {
        String? runId;
        switch (request.kind) {
          case 'analyze':
            runId = await _sendAnalyze(api, AnalyzeRequestData.fromJson(data), data.str('cuisineName'));
          // Queued by the app before the single analysis screen ("Öneri"): a product list and menu photos.
          case 'suggest':
            runId = await _sendAnalyze(api, _fromLegacySuggest(data), data.str('cuisineName'));
          case 'accept':
            final payload = data.object('payload');
            await api.accept(data.str('itemId'), payload: payload == null ? null : TemplatePayload.fromJson(payload));
          case 'skip':
            await api.skip(data.str('itemId'));
          case 'later':
            await api.later(data.str('itemId'));
          default:
            // A kind this version cannot send (a removed screen): kept for inspection, never reported as sent.
            await (_db.update(_db.pendingRequests)..where((t) => t.id.equals(request.id))).write(
                  PendingRequestsCompanion(status: const Value('failed'), lastError: Value('unsupported: ${request.kind}')),
                );
            continue;
        }
        await (_db.update(_db.pendingRequests)..where((t) => t.id.equals(request.id))).write(
              PendingRequestsCompanion(status: const Value('sent'), serverRunId: Value(runId)),
            );
        await _cleanupImages(request);
        sent += 1;
      } on ApiException catch (e) {
        await (_db.update(_db.pendingRequests)..where((t) => t.id.equals(request.id))).write(
              PendingRequestsCompanion(
                attempts: Value(request.attempts + 1),
                lastError: Value(e.message),
                status: Value(e.isNetwork || e.isUnauthorized ? 'queued' : 'failed'),
              ),
            );
        if (e.isNetwork || e.isUnauthorized) break;
      }
    }
    return sent;
  }

  Future<String> _sendAnalyze(ApiClient api, AnalyzeRequestData request, String cuisineName) async {
    final runId = await api.analyzeAsync(request);
    await _db.saveRecentRun(
      RecentRunsCompanion.insert(
        runId: runId,
        cuisineId: Value(request.cuisineId.isEmpty ? null : request.cuisineId),
        cuisineName: Value(cuisineName),
        title: Value(_title(request.menuText)),
        status: 'running',
        snapshotJson: '{}',
        createdAt: DateTime.now(),
        mode: Value(request.mode.wire),
      ),
    );
    return runId;
  }

  /// The old "Öneri" request: its product list becomes the analysis' menu text, its photos stay photos.
  static AnalyzeRequestData _fromLegacySuggest(Json data) => AnalyzeRequestData(
        cuisineId: data.str('cuisineId'),
        menuText: data.str('promptText'),
        images: data.objects('images').map((i) => UploadImage(path: i.str('path'), sha256: i.str('sha256'))).toList(),
      );

  Future<void> _cleanupImages(PendingRequest request) async {
    final decoded = jsonDecode(request.imagePathsJson);
    if (decoded is! List) return;
    for (final path in decoded.whereType<String>()) {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    }
  }

  static String _title(String prompt) {
    final trimmed = prompt.trim().replaceAll(RegExp(r'\s+'), ' ');
    return trimmed.length > 60 ? '${trimmed.substring(0, 60)}…' : trimmed;
  }
}
