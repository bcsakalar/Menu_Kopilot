import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/utils/copy_format.dart';
import 'package:menu_kopilot/core/utils/image_compressor.dart';
import 'package:menu_kopilot/data/models/suggestion.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

const adana = TemplatePayload(
  name: 'Adana Kebap',
  description: 'Zırhla çekilmiş acılı kuzu kıyma şişte közde pişirilir.',
  servingNote: 'Sıcak servis',
  portionInfo: '1 porsiyon ~180 g',
  optionGroups: [
    OptionGroup(
      name: 'Porsiyon',
      isRequired: true,
      minSelect: 1,
      options: [
        TemplateOption(name: 'Yarım Porsiyon', priceMode: PriceMode.setsBase),
        TemplateOption(name: '1 Porsiyon', priceMode: PriceMode.setsBase, isDefault: true),
      ],
    ),
    OptionGroup(
      name: 'Yanında',
      selectionType: SelectionType.multi,
      maxSelect: 2,
      options: [
        TemplateOption(name: 'Sumaklı Soğan'),
        TemplateOption(name: 'Bulgur Pilavı', priceMode: PriceMode.surcharge),
      ],
    ),
  ],
  removableIngredients: ['Soğan', 'Sumak'],
  extraIngredients: [ExtraIngredient(name: 'Ekstra Lavaş')],
  tags: ['acılı'],
  upsellSuggestion: 'Yanına şalgam',
);

void main() {
  group('TemplatePayload', () {
    test('round-trips through JSON (wire names match the backend)', () {
      final json = adana.toJson();
      expect((json['optionGroups']! as List).first, containsPair('selectionType', 'single'));
      final options = ((json['optionGroups']! as List).first as Map<String, Object?>)['options']! as List;
      expect((options.first as Map<String, Object?>)['priceMode'], 'sets_base');
      expect(TemplatePayload.fromJson(json), adana);
    });

    test('normalized() enforces group rules and a single base-price group', () {
      const messy = TemplatePayload(
        name: '  Şalgam ',
        description: '',
        optionGroups: [
          OptionGroup(name: 'Boy', selectionType: SelectionType.multi, maxSelect: 5, options: [
            TemplateOption(name: 'Küçük', priceMode: PriceMode.setsBase),
            TemplateOption(name: 'Büyük'),
          ]),
          OptionGroup(name: 'Acılık', isRequired: true, options: [
            TemplateOption(name: 'Acılı', priceMode: PriceMode.setsBase),
            TemplateOption(name: ' ', priceMode: PriceMode.free),
          ]),
          OptionGroup(name: '', options: [TemplateOption(name: 'x')]),
        ],
        tags: ['içecek', 'İçecek ', ''],
      );
      final n = messy.normalized();
      expect(n.name, 'Şalgam');
      expect(n.optionGroups.map((g) => g.name), ['Boy', 'Acılık']);
      final boy = n.optionGroups.first;
      expect(boy.selectionType, SelectionType.single);
      expect(boy.isRequired, isTrue);
      expect(boy.options.every((o) => o.priceMode == PriceMode.setsBase), isTrue);
      final acilik = n.optionGroups.last;
      expect(acilik.options.map((o) => o.name), ['Acılı']);
      expect(acilik.options.single.priceMode, PriceMode.surcharge);
      expect(acilik.minSelect, 1);
      expect(n.tags, ['içecek']);
    });

    test('clamps descriptions to 160 characters', () {
      final long = adana.copyWith(description: 'x' * 200).normalized();
      expect(long.description.length, descriptionMaxLength);
    });

    test('hasContent requires a description or an option group', () {
      expect(const TemplatePayload(name: 'Kola').hasContent, isFalse);
      expect(adana.hasContent, isTrue);
    });
  });

  group('copy format', () {
    test('renders a readable block with price hints and no amounts', () {
      final text = formatCard(lookupAppLocalizations(const Locale('tr')), adana);
      expect(text, contains('Adana Kebap'));
      expect(text, contains('Porsiyon (tek seçim, zorunlu): Yarım Porsiyon [tabanı belirler], 1 Porsiyon (varsayılan) [tabanı belirler]'));
      expect(text, contains('Yanında (çoklu seçim, en fazla 2, isteğe bağlı)'));
      expect(text, contains('Çıkarılabilir: Soğan, Sumak'));
      expect(text, isNot(contains('TL')));
      expect(formatGroupOptions(adana.optionGroups.first), 'Yarım Porsiyon\n1 Porsiyon');
    });
  });

  group('image compression math', () {
    test('long edge lands on 1600 whatever the orientation', () {
      for (final (w, h) in [(4000, 3000), (3000, 4000), (4032, 1908), (1600, 1200), (800, 600)]) {
        final minSide = compressMinSide(w, h);
        final (outW, outH) = scaledSize(w, h, minSide);
        final expectedLong = (w > h ? w : h) > maxImageEdge ? maxImageEdge : (w > h ? w : h);
        expect((outW > outH ? outW : outH), closeTo(expectedLong, 1), reason: '$w×$h');
      }
    });

    test('never upscales small images', () {
      expect(compressMinSide(800, 600), 600);
      expect(scaledSize(800, 600, 600), (800, 600));
    });
  });

  group('SuggestionCard', () {
    test('parses origin/status and keeps unknown values safe', () {
      final card = SuggestionCard.fromJson({
        'id': 'c1',
        'runId': 'r1',
        'rawName': 'x',
        'origin': 'mystery',
        'status': 'accepted',
        'payload': {'name': 'X'},
      });
      expect(card.origin, CardOrigin.review);
      expect(card.status, CardStatus.accepted);
      expect(card.copyWith(edited: true).edited, isTrue);
    });
  });
}
