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

/// Offline request queue: suggestions / accepts / skips made without a connection are stored in SQLite (images
/// copied into the app's documents folder) and sent later — by the app on reconnect or by the background worker.
class PendingQueue {
  PendingQueue(this._db, {this.storageDir});

  final AppDatabase _db;

  /// Where queued photos are copied so they survive until sent (app documents folder).
  final Future<Directory> Function()? storageDir;
  static const _uuid = Uuid();

  Future<String> enqueueSuggest(SuggestRequestData request, {String cuisineName = ''}) async {
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
    final stored = SuggestRequestData(
      cuisineId: request.cuisineId,
      promptText: request.promptText,
      branchId: request.branchId,
      deepMode: request.deepMode,
      images: images,
    );
    await _db.into(_db.pendingRequests).insert(
          PendingRequestsCompanion.insert(
            id: id,
            kind: 'suggest',
            payloadJson: jsonEncode({...stored.toJson(), 'cuisineName': cuisineName}),
            imagePathsJson: Value(jsonEncode(images.map((i) => i.path).toList())),
            createdAt: DateTime.now(),
          ),
        );
    return id;
  }

  Future<void> enqueueAccept(String itemId, {TemplatePayload? payload, String? branchId}) =>
      _db.into(_db.pendingRequests).insert(
            PendingRequestsCompanion.insert(
              id: _uuid.v4(),
              kind: 'accept',
              payloadJson: jsonEncode({'itemId': itemId, 'payload': payload?.toJson(), 'branchId': branchId}),
              createdAt: DateTime.now(),
            ),
          );

  Future<void> enqueueSkip(String itemId) => _db.into(_db.pendingRequests).insert(
        PendingRequestsCompanion.insert(
          id: _uuid.v4(),
          kind: 'skip',
          payloadJson: jsonEncode({'itemId': itemId}),
          createdAt: DateTime.now(),
        ),
      );

  /// Sends queued requests in order. Stops at the first network error (still offline). Returns how many were sent.
  Future<int> flush(ApiClient api) async {
    var sent = 0;
    for (final request in await _db.queuedRequests()) {
      final data = asJson(jsonDecode(request.payloadJson));
      try {
        String? runId;
        switch (request.kind) {
          case 'suggest':
            runId = await api.suggestAsync(SuggestRequestData.fromJson(data));
            await _db.saveRecentRun(
              RecentRunsCompanion.insert(
                runId: runId,
                cuisineId: Value(data.strOrNull('cuisineId')),
                cuisineName: Value(data.str('cuisineName')),
                title: Value(_title(data.str('promptText'))),
                status: 'running',
                snapshotJson: '{}',
                createdAt: DateTime.now(),
              ),
            );
          case 'accept':
            final payload = data.object('payload');
            await api.accept(
              data.str('itemId'),
              payload: payload == null ? null : TemplatePayload.fromJson(payload),
              branchId: data.strOrNull('branchId'),
            );
          case 'skip':
            await api.skip(data.str('itemId'));
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
