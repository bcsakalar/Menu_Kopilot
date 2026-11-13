/**
 * System cuisines: the kitchen categories food-ordering apps commonly use (Burger, Döner, Köfte, Steak, Tavuk, Kebap,
 * Pizza, Tatlı, Mantı & Makarna, Salata & Sağlık, Dondurma, Kahvaltı, Ev Yemekleri, Pide & Lahmacun, Pastane & Fırın,
 * Kahve & İçecek, Tost & Sandviç, Sokak Lezzetleri, Balık & Deniz Ürünleri, Uzak Doğu, Dünya Mutfağı, Börek,
 * Çiğ Köfte, Meze, Çorba, Tantuni).
 *
 * min_item_count starts at 10 for every cuisine on purpose: real per-cuisine minimums differ from team to team and are
 * entered by the user from the settings screen (never hard-coded). Re-seeding never overwrites a cuisine the user
 * edited; the notes are refreshed only while they still hold a text written by an earlier seed (LEGACY_NOTES).
 * Parents drive recommendations: a branch sees its own cuisine first, then parent/children, then siblings.
 */

export const CUISINE_SLUGS = [
  'kebap-izgara',
  'doner',
  'pide-lahmacun',
  'kofte',
  'cigkofte',
  'ev-yemekleri',
  'corba',
  'manti-hamur-isleri',
  'tatli',
  'dondurma',
  'sokak-lezzetleri',
  'tantuni',
  'burger',
  'tavuk',
  'pizza',
  'steak',
  'kahvalti',
  'tost-sandvic',
  'pastane-firin',
  'borek',
  'kafe-icecek',
  'balik-deniz',
  'meze',
  'salata-saglikli',
  'uzak-dogu',
  'dunya-mutfagi',
] as const;
export type CuisineSlug = (typeof CUISINE_SLUGS)[number];

export interface SeedCuisine {
  slug: CuisineSlug;
  name: string;
  parentSlug?: CuisineSlug;
  minItemCount: number;
  notes: string;
}

/** Notes written by earlier seeds; a cuisine that still carries one of these was never edited by the user. */
export const LEGACY_NOTES: readonly string[] = [
  'Varsayılan minimum 10; gerçek sayıyı Ayarlar > Mutfak Türleri ekranından gir.',
];

const MIN = 10;

export const SEED_CUISINES: readonly SeedCuisine[] = [
  {
    slug: 'kebap-izgara',
    name: 'Kebap',
    minItemCount: MIN,
    notes:
      'Bölümler: Çorbalar, Kebaplar, Izgaralar, Dürümler, Salata & Mezeler, İçecekler, Tatlılar. Olmazsa olmaz: Adana, Urfa, Tavuk Şiş, Izgara Köfte, Ayran, Şalgam. Sor: porsiyon (yarım / 1 / 1,5), servis şekli (porsiyon / dürüm / ekmek arası), acı seviyesi, ekmek seçimi, yanında gelenler (közlenmiş sebze, pilav).',
  },
  {
    slug: 'doner',
    name: 'Döner',
    parentSlug: 'kebap-izgara',
    minItemCount: MIN,
    notes:
      'Bölümler: Dürümler, Ekmek Arası, Porsiyonlar, Menüler, Yan Ürünler, İçecekler. Olmazsa olmaz: Tavuk ve Et Döner Dürüm, Yarım Ekmek, Pilav Üstü, İskender, Patates. Sor: gramaj / porsiyon, lavaş türü, sos seçimi, çıkarılacaklar (soğan, domates, turşu), menü (patates + içecek).',
  },
  {
    slug: 'pide-lahmacun',
    name: 'Pide & Lahmacun',
    parentSlug: 'kebap-izgara',
    minItemCount: MIN,
    notes:
      'Bölümler: Lahmacun, Kapalı / Açık Pideler, Kaşarlı Pideler, İçecekler, Tatlılar. Olmazsa olmaz: Lahmacun, Kıymalı, Kaşarlı, Kuşbaşılı, Karışık Pide, Ayran. Sor: acı seviyesi, pide boyu (tek / çift kişilik), ekstra kaşar veya yumurta, yanında gelen yeşillik ve limon.',
  },
  {
    slug: 'kofte',
    name: 'Köfte',
    parentSlug: 'kebap-izgara',
    minItemCount: MIN,
    notes:
      'Bölümler: Köfteler, Ekmek Arası, Dürüm, Piyaz & Salatalar, Çorbalar, İçecekler, Tatlılar. Olmazsa olmaz: Izgara Köfte, Köfte Ekmek, Piyaz, Ayran. Sor: porsiyon (adet / gram), pilav seçimi, yanında (piyaz, közlenmiş biber), acılı / acısız, menü seçeneği.',
  },
  {
    slug: 'cigkofte',
    name: 'Çiğ Köfte',
    minItemCount: MIN,
    notes:
      'Bölümler: Dürümler, Porsiyon / Gramaj, Menüler, Soslar, İçecekler, Tatlılar. Olmazsa olmaz: Çiğ Köfte Dürüm, Porsiyon, Gramajlı Paket, Şalgam, Ayran. Sor: acı seviyesi, lavaş türü, yeşillik (marul, roka, nane), sos (nar ekşisi, acı sos, limon), menü seçeneği.',
  },
  {
    slug: 'ev-yemekleri',
    name: 'Ev Yemekleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Çorbalar, Ana Yemekler, Etli / Zeytinyağlı Yemekler, Pilavlar, Salata & Cacık, Tatlılar, İçecekler. Olmazsa olmaz: Mercimek Çorbası, Kuru Fasulye, Pilav, Etli Nohut, Tavuk Sote, Cacık, Ayran. Sor: porsiyon (yarım / tam), pilav seçimi, yanında (turşu, salata, ekmek), günlük menü mü sabit mi.',
  },
  {
    slug: 'corba',
    name: 'Çorba',
    parentSlug: 'ev-yemekleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Çorbalar, Kelle Paça & İşkembe, Ekstralar, İçecekler. Olmazsa olmaz: Mercimek, Ezogelin, Tavuk Suyu, Yayla, İşkembe. Sor: kase boyu (küçük / büyük), sarımsak ve sirke, limon, pul biber / tereyağlı sos, yanında ekmek.',
  },
  {
    slug: 'manti-hamur-isleri',
    name: 'Mantı & Makarna',
    parentSlug: 'ev-yemekleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Mantılar, Makarnalar, Gözlemeler, Börekler, Erişte, İçecekler. Olmazsa olmaz: Kayseri Mantısı, Çıtır Mantı, Gözleme, Su Böreği, Spagetti Bolonez, Ayran. Sor: porsiyon, yoğurt (sarımsaklı / sarımsaksız), sos (tereyağlı pul biber, domatesli), makarna türü, gözleme iç harcı.',
  },
  {
    slug: 'tatli',
    name: 'Tatlı',
    minItemCount: MIN,
    notes:
      'Bölümler: Şerbetli Tatlılar, Sütlü Tatlılar, Künefe & Katmer, Pastalar, Dondurmalar. Olmazsa olmaz: Künefe, Baklava, Sütlaç, Kazandibi, Profiterol, Sufle. Sor: porsiyon / gramaj, dondurma veya kaymak eki, fıstık miktarı, sıcak / soğuk servis.',
  },
  {
    slug: 'dondurma',
    name: 'Dondurma',
    parentSlug: 'tatli',
    minItemCount: MIN,
    notes:
      'Bölümler: Top / Külah Dondurma, Paket Dondurma (gramaj), Dondurmalı Tatlılar, Milkshake. Olmazsa olmaz: Top Dondurma, Maraş Dondurması, Paket, Milkshake. Sor: top sayısı, aroma seçimi, sos ve süsleme, kase / külah.',
  },
  {
    slug: 'sokak-lezzetleri',
    name: 'Sokak Lezzetleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Kokoreç, Midye, Kumpir, Waffle, Islak Hamburger, İçecekler. Olmazsa olmaz: Kokoreç, Midye Dolma, Kumpir, Ayran, Şalgam. Sor: boy (çeyrek / yarım / tam ekmek), acı seviyesi, adet (midye), iç malzeme seçimi (kumpir, waffle).',
  },
  {
    slug: 'tantuni',
    name: 'Tantuni',
    parentSlug: 'sokak-lezzetleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Tantuni Dürümler, Ekmek Arası, Porsiyon, İçecekler. Olmazsa olmaz: Et Tantuni Dürüm, Tavuk Tantuni, Yarım Ekmek, Şalgam, Ayran. Sor: lavaş (tek / çift), acı seviyesi, domates-maydanoz-soğan, kaşar eki.',
  },
  {
    slug: 'burger',
    name: 'Burger',
    minItemCount: MIN,
    notes:
      'Bölümler: Menüler, Burgerler, Tavuk Burgerler, Yan Ürünler, Soslar, İçecekler, Tatlılar. Olmazsa olmaz: Hamburger, Cheeseburger, Tavuk Burger, Patates, Soğan Halkası, İçecek. Sor: menü (patates + içecek), köfte gramajı / tek-çift köfte, pişirme derecesi, peynir, ekstra malzeme, sos.',
  },
  {
    slug: 'tavuk',
    name: 'Tavuk',
    minItemCount: MIN,
    notes:
      'Bölümler: Kova & Paylaşım, Çıtır Tavuk, Kanat, Izgara Tavuk, Dürüm / Wrap, Yan Ürünler, Soslar, İçecekler. Olmazsa olmaz: Çıtır Tavuk, Kanat, Kova Menü, Tavuk Dürüm, Patates. Sor: adet, acılı / acısız, sos seçimi, menü (patates + içecek).',
  },
  {
    slug: 'pizza',
    name: 'Pizza',
    minItemCount: MIN,
    notes:
      'Bölümler: Kampanyalı Menüler, Klasik Pizzalar, Özel Pizzalar, Yan Ürünler, Soslar, İçecekler, Tatlılar. Olmazsa olmaz: Margherita, Karışık, Sucuklu, Pepperoni, Tavuklu, Sarımsaklı Ekmek. Sor: boy, hamur (ince / klasik / kalın), kenar, ekstra malzeme, çıkarılacaklar.',
  },
  {
    slug: 'steak',
    name: 'Steak',
    minItemCount: MIN,
    notes:
      'Bölümler: Steakler, Et Yemekleri, Sandviçler, Garnitürler, Soslar, İçecekler. Olmazsa olmaz: Bonfile, Antrikot, Et Sote, Çökertme. Sor: gramaj, pişirme derecesi, garnitür (patates püresi, sebze, pilav), sos (mantar, biberli, chimichurri).',
  },
  {
    slug: 'kahvalti',
    name: 'Kahvaltı',
    minItemCount: MIN,
    notes:
      'Bölümler: Serpme / Tabak Kahvaltı, Yumurtalar, Sıcaklar, Tostlar, Hamur İşleri, Çay & Kahve. Olmazsa olmaz: Kahvaltı Tabağı, Serpme, Menemen, Sucuklu Yumurta, Omlet, Çay. Sor: kişi sayısı, yumurta pişirme şekli, peynir çeşitleri, sıcak eki (sigara böreği, patates).',
  },
  {
    slug: 'tost-sandvic',
    name: 'Tost & Sandviç',
    parentSlug: 'kahvalti',
    minItemCount: MIN,
    notes:
      'Bölümler: Tostlar, Ayvalık / Kumru, Sandviçler, Bazlama, İçecekler. Olmazsa olmaz: Kaşarlı, Karışık, Sucuklu Tost, Ayvalık Tostu, Kumru. Sor: ekmek türü (tost ekmeği / somun / bazlama), peynir çeşidi, ekstra malzeme, yanında turşu veya patates.',
  },
  {
    slug: 'pastane-firin',
    name: 'Pastane & Fırın',
    minItemCount: MIN,
    notes:
      'Bölümler: Simit & Poğaça, Açma & Çörek, Kurabiyeler, Pasta Dilimleri, Yaş Pastalar, Ekmekler, İçecekler. Olmazsa olmaz: Simit, Poğaça, Açma, Pasta Dilimi, Kurabiye. Sor: adet / gramaj, iç harç (peynir, zeytin), pasta boyu (kişi sayısı), yazı / mum.',
  },
  {
    slug: 'borek',
    name: 'Börek',
    parentSlug: 'pastane-firin',
    minItemCount: MIN,
    notes:
      'Bölümler: Tepsi Börekleri, Kol Börekleri, Su Böreği, Sigara Böreği, Tatlı Börekler, İçecekler. Olmazsa olmaz: Su Böreği, Peynirli, Kıymalı, Ispanaklı, Patatesli, Sigara Böreği. Sor: porsiyon / gramaj, sıcak servis, yanında çay veya ayran.',
  },
  {
    slug: 'kafe-icecek',
    name: 'Kahve & İçecek',
    minItemCount: MIN,
    notes:
      'Bölümler: Sıcak Kahveler, Soğuk Kahveler, Çaylar, Soğuk İçecekler, Taze Sıkma, Tatlılar. Olmazsa olmaz: Türk Kahvesi, Latte, Americano, Çay, Limonata, Soğuk içecekler. Sor: boy, süt seçimi (laktozsuz / bitkisel), şurup, şeker, ekstra shot, buz.',
  },
  {
    slug: 'balik-deniz',
    name: 'Balık & Deniz Ürünleri',
    minItemCount: MIN,
    notes:
      'Bölümler: Izgara Balıklar, Tavalar, Deniz Ürünleri, Balık Ekmek & Dürüm, Salatalar & Mezeler, İçecekler. Olmazsa olmaz: Levrek, Çipura, Hamsi, Kalamar, Balık Ekmek, Roka Salatası. Sor: pişirme şekli (ızgara / tava / buğulama), porsiyon / gramaj, mevsim balığı, yanında salata ve roka.',
  },
  {
    slug: 'meze',
    name: 'Meze',
    parentSlug: 'balik-deniz',
    minItemCount: MIN,
    notes:
      'Bölümler: Soğuk Mezeler, Zeytinyağlılar, Sıcak Mezeler, Meze Tabakları, Ekmek. Olmazsa olmaz: Haydari, Humus, Acılı Ezme, Patlıcan Salatası, Rus Salatası, Yaprak Sarma. Sor: porsiyon (küçük / büyük), acılık, yanında ekmek, karışık tabak seçimi.',
  },
  {
    slug: 'salata-saglikli',
    name: 'Salata & Sağlık',
    minItemCount: MIN,
    notes:
      'Bölümler: Salatalar, Bowl Kaseler, Sağlıklı Sandviç / Wrap, Smoothie, İçecekler. Olmazsa olmaz: Sezar, Çoban, Mevsim, Ton Balıklı, Tavuklu Bowl. Sor: sos (ayrı kapta mı), protein seçimi (tavuk, ton, hellim, falafel), glutensiz / vegan seçenek, kalori bilgisi.',
  },
  {
    slug: 'uzak-dogu',
    name: 'Uzak Doğu',
    minItemCount: MIN,
    notes:
      'Bölümler: Sushi Roll, Nigiri & Maki, Noodle & Wok, Pilavlar, Başlangıçlar, Soslar, İçecekler. Olmazsa olmaz: California Roll, Philadelphia Roll, Tavuklu Noodle, Wok, Çıtır Tavuk, Gyoza. Sor: adet (roll parça sayısı), acılık, soya / wasabi / zencefil, protein seçimi.',
  },
  {
    slug: 'dunya-mutfagi',
    name: 'Dünya Mutfağı & Cafe',
    minItemCount: MIN,
    notes:
      'Bölümler: Wrap & Burrito, Tacos & Quesadilla, Şinitzel, Falafel, Başlangıçlar, Soslar, İçecekler. Olmazsa olmaz: Tavuklu Wrap, Burrito, Quesadilla, Şinitzel, Nachos. Sor: protein seçimi, acılık, yanında (patates, pilav, salata), sos.',
  },
];
