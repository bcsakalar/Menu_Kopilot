import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/utils/image_compressor.dart';
import 'package:menu_kopilot/core/widgets/common.dart';
import 'package:menu_kopilot/features/gap/gap_controller.dart';
import 'package:menu_kopilot/features/home/home_controller.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

DioException dioError({int? status, Object? data, DioExceptionType type = DioExceptionType.badResponse}) {
  final request = RequestOptions(path: '/x');
  return DioException(
    requestOptions: request,
    type: type,
    response: status == null ? null : Response<Object?>(requestOptions: request, statusCode: status, data: data),
  );
}

PickedImage picked(String hash) => PickedImage(path: '/tmp/$hash.jpg', bytes: 1000, sha256: hash, width: 1600, height: 1200);

void main() {
  final l10n = lookupAppLocalizations(const Locale('tr'));

  group('ApiException + apiErrorText', () {
    test('server envelope messages are shown as-is', () {
      final e = ApiException.fromDio(dioError(status: 409, data: {
        'error': {'code': 'LOCAL_ONLY_MODE', 'message': 'Yerel mod açık'},
      }));
      expect(e.code, 'LOCAL_ONLY_MODE');
      expect(e.serverMessage, 'Yerel mod açık');
      expect(apiErrorText(l10n, e), 'Yerel mod açık');
    });

    test('connection problems and proxy gateway errors read as "no connection"', () {
      for (final e in [
        ApiException.fromDio(dioError(type: DioExceptionType.connectionError)),
        ApiException.fromDio(dioError(status: 502, data: '<html>Bad Gateway</html>')),
        ApiException.fromDio(dioError(status: 503)),
      ]) {
        expect(e.isNetwork, isTrue, reason: e.toString());
        expect(apiErrorText(l10n, e), l10n.networkError);
      }
    });

    test('local failures never show English or technical text', () {
      final http = ApiException.fromDio(dioError(status: 500, data: 'oops'));
      expect(http.serverMessage, isNull);
      expect(apiErrorText(l10n, http), l10n.genericError);
      expect(apiErrorText(l10n, ApiException.fromDio(dioError(type: DioExceptionType.cancel))), l10n.cancelled);
      expect(apiErrorText(l10n, StateError('boom')), l10n.genericError);
      // An envelope without a message is not trusted as user text either.
      final empty = ApiException.fromDio(dioError(status: 400, data: {
        'error': {'code': 'VALIDATION_ERROR', 'message': ''},
      }));
      expect(apiErrorText(l10n, empty), l10n.genericError);
    });
  });

  group('adding photos', () {
    ProviderContainer containerWith(ImageCompressor compress) =>
        ProviderContainer(overrides: [imageCompressorProvider.overrideWithValue(compress)]);

    test('an unreadable photo is reported and the others are kept', () async {
      final container = containerWith((path) async {
        if (path.endsWith('.heic')) throw const ImageCompressException('unsupported image format');
        return picked(path);
      });
      addTearDown(container.dispose);
      final result = await container.read(homeDraftProvider.notifier).addImages(['a.jpg', 'b.heic', 'c.jpg']);
      expect(result, (skipped: 0, failed: 1));
      final draft = container.read(homeDraftProvider);
      expect(draft.images.map((i) => i.sha256), ['a.jpg', 'c.jpg']);
      expect(draft.compressing, isFalse);
    });

    test('screenshots over the limit are skipped and duplicates (same content) dropped', () async {
      final container = containerWith((path) async => picked(path.startsWith('same') ? 'same' : path));
      addTearDown(container.dispose);
      final result = await container.read(gapDraftProvider.notifier).addImages(['same-1', 'same-2', 'x', 'y', 'z', 'w', 'v']);
      expect(result, (skipped: 2, failed: 0));
      expect(container.read(gapDraftProvider).images.map((i) => i.sha256), ['same', 'x', 'y', 'z']);
    });
  });
}
