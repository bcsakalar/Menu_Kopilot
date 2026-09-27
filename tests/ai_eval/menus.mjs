/**
 * Test menus for the AI evaluation — one per cuisine in the system (27, `backend/src/db/seed/cuisines.ts`).
 *
 * Each one is what a representative actually gets during a call with the restaurant: a small, INCOMPLETE menu (the
 * whole point of the product is to fill it), real Turkish dish names, prices on the printed version. The same menu
 * is used three ways:
 *   - `typed`   what the representative types or dictates (some written the way people type on a phone: no Turkish
 *               characters, lower case, a shortened name);
 *   - the photo rendered from `sections` in the given `style` (render-images.mjs) — a third of them deliberately
 *               blurred, skewed or low resolution;
 *   - `single`  the "ürün ekle" case: one product the restaurant mentions, alone, to see what a single product gets.
 *
 * `items` lists the canonical names on the menu, so product accuracy (what the photo reader returned vs what is
 * actually printed) can be measured.
 */

/** @typedef {{ title: string, items: [string, string][] }} Section */
/** @typedef {{ slug: string, restaurant: string, style: 'baski'|'defter'|'tahta'|'bulanik'|'egik', sections: Section[], typed: string, single: string }} EvalMenu */

/** @type {EvalMenu[]} */
export const MENUS = [
  {
    slug: 'kebap-izgara',
    restaurant: 'Ocakbaşı Usta',
    style: 'baski',
    sections: [
      { title: 'KEBAPLAR', items: [['Adana Kebap', '320 ₺'], ['Urfa Kebap', '320 ₺'], ['Beyti Sarma', '360 ₺'], ['Kuzu Şiş', '380 ₺'], ['Tavuk Şiş', '260 ₺']] },
      { title: 'ARA SICAK', items: [['İçli Köfte', '90 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '35 ₺']] },
    ],
    typed: 'Adana Kebap, Urfa Kebap, Beyti Sarma, Kuzu Şiş, Tavuk Şiş, İçli Köfte, Ayran',
    single: 'Kaburga Dolması',
  },
  {
    slug: 'doner',
    restaurant: 'Dönerci Hakkı',
    style: 'defter',
    sections: [
      { title: 'DÖNER', items: [['Et Döner Dürüm', '210 ₺'], ['Tavuk Döner Dürüm', '150 ₺'], ['Et Döner Porsiyon', '290 ₺'], ['İskender', '340 ₺'], ['Pilav Üstü Tavuk Döner', '190 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺'], ['Kola', '45 ₺']] },
    ],
    typed: 'et doner durum, tavuk doner durum, et doner porsiyon, iskender, pilav ustu tavuk doner, ayran, kola',
    single: 'Tombik Döner',
  },
  {
    slug: 'pide-lahmacun',
    restaurant: 'Karadeniz Pide Salonu',
    style: 'tahta',
    sections: [
      { title: 'PİDELER', items: [['Kıymalı Pide', '190 ₺'], ['Kaşarlı Pide', '200 ₺'], ['Kuşbaşılı Pide', '240 ₺'], ['Karışık Pide', '250 ₺'], ['Sucuklu Yumurtalı Pide', '210 ₺']] },
      { title: 'LAHMACUN', items: [['Lahmacun', '90 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '35 ₺']] },
    ],
    typed: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide, Lahmacun, Ayran',
    single: 'Kavurmalı Kaşarlı Pide',
  },
  {
    slug: 'kofte',
    restaurant: 'Köfteci Ramiz Usta',
    style: 'bulanik',
    sections: [
      { title: 'KÖFTELER', items: [['Izgara Köfte', '280 ₺'], ['Kaşarlı Köfte', '310 ₺'], ['Köfte Ekmek', '180 ₺']] },
      { title: 'YANINA', items: [['Piyaz', '90 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺'], ['Şalgam', '35 ₺']] },
    ],
    typed: 'Izgara Köfte, Kaşarlı Köfte, Köfte Ekmek, Piyaz, Ayran, Şalgam',
    single: 'Çökertme Köfte',
  },
  {
    slug: 'cigkofte',
    restaurant: 'Çiğköfteci Ali Usta',
    style: 'egik',
    sections: [
      { title: 'ÇİĞ KÖFTE', items: [['Çiğ Köfte Dürüm', '90 ₺'], ['Mega Dürüm', '130 ₺'], ['Çiğ Köfte Porsiyon', '160 ₺'], ['Çiğ Köfte Kase', '140 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺'], ['Şalgam', '35 ₺']] },
    ],
    typed: 'cig kofte durum, mega durum, cig kofte porsiyon, cig kofte kase, ayran, salgam',
    single: 'Çiğ Köfte Wrap',
  },
  {
    slug: 'ev-yemekleri',
    restaurant: 'Anne Eli Lokantası',
    style: 'baski',
    sections: [
      { title: 'GÜNÜN YEMEKLERİ', items: [['Kuru Fasulye', '160 ₺'], ['Pirinç Pilavı', '60 ₺'], ['Karnıyarık', '190 ₺'], ['Tavuk Sote', '170 ₺']] },
      { title: 'ÇORBA', items: [['Mercimek Çorbası', '70 ₺']] },
      { title: 'YANINA', items: [['Cacık', '50 ₺'], ['Ayran', '25 ₺']] },
    ],
    typed: 'Kuru Fasulye, Pirinç Pilavı, Karnıyarık, Tavuk Sote, Mercimek Çorbası, Cacık, Ayran',
    single: 'Etli Taze Fasulye',
  },
  {
    slug: 'corba',
    restaurant: 'Çorbacı Hüsnü',
    style: 'defter',
    sections: [
      { title: 'ÇORBALAR', items: [['Mercimek', '80 ₺'], ['Ezogelin', '80 ₺'], ['İşkembe', '150 ₺'], ['Kelle Paça', '180 ₺'], ['Yayla', '80 ₺'], ['Tavuk Suyu', '90 ₺']] },
    ],
    typed: 'mercimek, ezogelin, iskembe, kelle paca, yayla, tavuk suyu',
    single: 'Toyga Çorbası',
  },
  {
    slug: 'manti-hamur-isleri',
    restaurant: 'Kayseri Mantı Evi',
    style: 'tahta',
    sections: [
      { title: 'MANTI', items: [['Kayseri Mantısı', '220 ₺'], ['Çıtır Mantı', '230 ₺']] },
      { title: 'GÖZLEME', items: [['Peynirli Gözleme', '120 ₺'], ['Patatesli Gözleme', '110 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺']] },
    ],
    typed: 'Kayseri Mantısı, Çıtır Mantı, Peynirli Gözleme, Patatesli Gözleme, Ayran',
    single: 'Yaprak Mantı',
  },
  {
    slug: 'tatli',
    restaurant: 'Tatlıcı Safa',
    style: 'bulanik',
    sections: [
      { title: 'ŞERBETLİLER', items: [['Fıstıklı Baklava', '360 ₺'], ['Künefe', '220 ₺']] },
      { title: 'SÜTLÜLER', items: [['Sütlaç', '110 ₺'], ['Kazandibi', '120 ₺'], ['Trileçe', '140 ₺']] },
      { title: 'İÇECEK', items: [['Türk Kahvesi', '70 ₺']] },
    ],
    typed: 'Fıstıklı Baklava, Künefe, Sütlaç, Kazandibi, Trileçe, Türk Kahvesi',
    single: 'Fıstıklı Kadayıf Dolması',
  },
  {
    slug: 'dondurma',
    restaurant: 'Maraş Dondurmacısı',
    style: 'egik',
    sections: [
      { title: 'DONDURMA', items: [['Maraş Dondurması (Kilo)', '800 ₺'], ['Top Dondurma', '40 ₺'], ['Dondurmalı İrmik Helvası', '150 ₺']] },
      { title: 'İÇECEK', items: [['Milkshake', '120 ₺']] },
    ],
    typed: 'maras dondurmasi, top dondurma, dondurmali irmik helvasi, milkshake',
    single: 'Dondurmalı Künefe',
  },
  {
    slug: 'sokak-lezzetleri',
    restaurant: 'Sokak Lezzetleri Dükkanı',
    style: 'baski',
    sections: [
      { title: 'KOKOREÇ', items: [['Yarım Kokoreç', '250 ₺'], ['Çeyrek Kokoreç', '180 ₺']] },
      { title: 'SOKAK', items: [['Midye Dolma (10 adet)', '150 ₺'], ['Kumpir', '220 ₺'], ['Islak Hamburger', '60 ₺']] },
      { title: 'İÇECEK', items: [['Şalgam', '35 ₺']] },
    ],
    typed: 'Yarım Kokoreç, Çeyrek Kokoreç, Midye Dolma, Kumpir, Islak Hamburger, Şalgam',
    single: 'Nohutlu Pilav',
  },
  {
    slug: 'tantuni',
    restaurant: 'Mersin Tantuni',
    style: 'defter',
    sections: [
      { title: 'TANTUNİ', items: [['Et Tantuni Dürüm', '180 ₺'], ['Tavuk Tantuni Dürüm', '140 ₺'], ['Tantuni Tabak', '260 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺']] },
    ],
    typed: 'Et Tantuni Dürüm, Tavuk Tantuni Dürüm, Tantuni Tabak, Ayran',
    single: 'Kaşarlı Tavuk Tantuni',
  },
  {
    slug: 'burger',
    restaurant: 'Burger Garage',
    style: 'tahta',
    sections: [
      { title: 'BURGERLER', items: [['Klasik Burger', '260 ₺'], ['Cheeseburger', '290 ₺'], ['Tavuk Burger', '220 ₺']] },
      { title: 'YANINA', items: [['Patates Kızartması', '90 ₺'], ['Soğan Halkası', '100 ₺']] },
      { title: 'İÇECEK', items: [['Kutu Kola', '60 ₺']] },
    ],
    typed: 'klasik burger, cheeseburger, tavuk burger, patates kizartmasi, sogan halkasi, kutu kola',
    single: 'Mantarlı Swiss Burger',
  },
  {
    slug: 'tavuk',
    restaurant: 'Çıtır Tavuk Evi',
    style: 'bulanik',
    sections: [
      { title: 'TAVUK', items: [['Çıtır Tavuk (6 parça)', '260 ₺'], ['Tavuk Kanat (8 adet)', '230 ₺'], ['Tavuk Nugget (9 adet)', '180 ₺']] },
      { title: 'YANINA', items: [['Patates', '80 ₺'], ['Coleslaw', '60 ₺']] },
      { title: 'İÇECEK', items: [['Kola', '50 ₺']] },
    ],
    typed: 'Çıtır Tavuk, Tavuk Kanat, Tavuk Nugget, Patates, Coleslaw, Kola',
    single: 'Acılı Tavuk Burger',
  },
  {
    slug: 'pizza',
    restaurant: 'Napoli Pizza',
    style: 'egik',
    sections: [
      { title: 'PİZZALAR', items: [['Margherita', '280 ₺'], ['Karışık Pizza', '340 ₺'], ['Sucuklu Pizza', '320 ₺'], ['Tavuklu Pizza', '310 ₺']] },
      { title: 'YANINA', items: [['Sarımsaklı Ekmek', '90 ₺']] },
      { title: 'İÇECEK', items: [['Kola 1 L', '90 ₺']] },
    ],
    typed: 'Margherita, Karışık Pizza, Sucuklu Pizza, Tavuklu Pizza, Sarımsaklı Ekmek, Kola 1 L',
    single: 'Füme Etli Pizza',
  },
  {
    slug: 'makarna',
    restaurant: 'Pasta La Vista',
    style: 'baski',
    sections: [
      { title: 'MAKARNALAR', items: [['Spagetti Bolonez', '260 ₺'], ['Fettuccine Alfredo', '280 ₺'], ['Penne Arrabbiata', '240 ₺'], ['Lazanya', '300 ₺']] },
      { title: 'İÇECEK', items: [['Limonata', '80 ₺']] },
    ],
    typed: 'Spagetti Bolonez, Fettuccine Alfredo, Penne Arrabbiata, Lazanya, Limonata',
    single: 'Kremalı Somonlu Makarna',
  },
  {
    slug: 'steak',
    restaurant: 'Et Atölyesi',
    style: 'defter',
    sections: [
      { title: 'ETLER', items: [['Dallas Steak', '950 ₺'], ['Bonfile', '780 ₺'], ['Antrikot', '720 ₺'], ['Dana Kaburga', '850 ₺']] },
      { title: 'GARNİTÜR', items: [['Patates Püresi', '120 ₺']] },
    ],
    typed: 'dallas steak, bonfile, antrikot, dana kaburga, patates puresi',
    single: 'Tomahawk Steak',
  },
  {
    slug: 'kahvalti',
    restaurant: 'Köy Kahvaltı Evi',
    style: 'tahta',
    sections: [
      { title: 'KAHVALTI', items: [['Serpme Kahvaltı (2 kişilik)', '900 ₺'], ['Menemen', '180 ₺'], ['Sucuklu Yumurta', '200 ₺']] },
      { title: 'HAMUR İŞİ', items: [['Gözleme', '150 ₺'], ['Pişi', '120 ₺']] },
      { title: 'İÇECEK', items: [['Çay', '25 ₺']] },
    ],
    typed: 'Serpme Kahvaltı, Menemen, Sucuklu Yumurta, Gözleme, Pişi, Çay',
    single: 'Kaygana',
  },
  {
    slug: 'tost-sandvic',
    restaurant: 'Tostçu Mahmut',
    style: 'bulanik',
    sections: [
      { title: 'TOSTLAR', items: [['Kaşarlı Tost', '120 ₺'], ['Karışık Tost', '150 ₺'], ['Sucuklu Kaşarlı Tost', '160 ₺'], ['Ayvalık Tostu', '190 ₺']] },
      { title: 'İÇECEK', items: [['Ayran', '30 ₺'], ['Çay', '20 ₺']] },
    ],
    typed: 'Kaşarlı Tost, Karışık Tost, Sucuklu Kaşarlı Tost, Ayvalık Tostu, Ayran, Çay',
    single: 'Hellimli Sandviç',
  },
  {
    slug: 'pastane-firin',
    restaurant: 'Güneş Fırın',
    style: 'egik',
    sections: [
      { title: 'FIRIN', items: [['Simit', '20 ₺'], ['Poğaça', '25 ₺'], ['Açma', '25 ₺'], ['Su Böreği (Dilim)', '90 ₺'], ['Kruvasan', '60 ₺']] },
      { title: 'İÇECEK', items: [['Çay', '20 ₺']] },
    ],
    typed: 'simit, pogaca, acma, su boregi, kruvasan, cay',
    single: 'Kakaolu Çörek',
  },
  {
    slug: 'borek',
    restaurant: 'Börekçi Nuri',
    style: 'baski',
    sections: [
      { title: 'BÖREKLER', items: [['Su Böreği', '110 ₺'], ['Ispanaklı Kol Böreği', '100 ₺'], ['Kıymalı Börek', '120 ₺'], ['Peynirli Börek', '100 ₺']] },
      { title: 'İÇECEK', items: [['Çay', '20 ₺'], ['Ayran', '30 ₺']] },
    ],
    typed: 'Su Böreği, Ispanaklı Kol Böreği, Kıymalı Börek, Peynirli Börek, Çay, Ayran',
    single: 'Arnavut Böreği',
  },
  {
    slug: 'kafe-icecek',
    restaurant: 'Köşe Kahve',
    style: 'tahta',
    sections: [
      { title: 'KAHVELER', items: [['Türk Kahvesi', '70 ₺'], ['Filtre Kahve', '85 ₺'], ['Latte', '110 ₺'], ['Americano', '95 ₺']] },
      { title: 'SICAK & SOĞUK', items: [['Çay', '25 ₺'], ['Limonata', '80 ₺']] },
      { title: 'YANINA', items: [['Kaşarlı Tost', '120 ₺']] },
    ],
    typed: 'Türk Kahvesi, Filtre Kahve, Latte, Americano, Çay, Limonata, Kaşarlı Tost',
    single: 'Pumpkin Spice Latte',
  },
  {
    slug: 'balik-deniz',
    restaurant: 'Balıkçı Mehmet',
    style: 'defter',
    sections: [
      { title: 'BALIKLAR', items: [['Hamsi Tava', '280 ₺'], ['Levrek Izgara', '450 ₺'], ['Çipura Izgara', '450 ₺'], ['Kalamar Tava', '380 ₺'], ['Balık Ekmek', '180 ₺']] },
      { title: 'SALATA', items: [['Roka Salatası', '90 ₺']] },
    ],
    typed: 'Hamsi Tava, Levrek Izgara, Çipura Izgara, Kalamar Tava, Balık Ekmek, Roka Salatası',
    single: 'Levrek Buğulama',
  },
  {
    slug: 'meze',
    restaurant: 'Meyhane Meze',
    style: 'bulanik',
    sections: [
      { title: 'SOĞUK MEZELER', items: [['Haydari', '90 ₺'], ['Humus', '100 ₺'], ['Fava', '90 ₺'], ['Acılı Ezme', '80 ₺'], ['Şakşuka', '100 ₺'], ['Patlıcan Salatası', '100 ₺'], ['Rus Salatası', '90 ₺']] },
    ],
    typed: 'haydari, humus, fava, acili ezme, saksuka, patlican salatasi, rus salatasi',
    single: 'Girit Ezmesi',
  },
  {
    slug: 'salata-saglikli',
    restaurant: 'Fit Bowl',
    style: 'baski',
    sections: [
      { title: 'SALATA & BOWL', items: [['Sezar Salata', '220 ₺'], ['Tavuklu Bowl', '260 ₺'], ['Ton Balıklı Salata', '240 ₺'], ['Kinoalı Salata', '230 ₺']] },
      { title: 'İÇECEK', items: [['Taze Portakal Suyu', '90 ₺']] },
    ],
    typed: 'Sezar Salata, Tavuklu Bowl, Ton Balıklı Salata, Kinoalı Salata, Taze Portakal Suyu',
    single: 'Avokadolu Somon Bowl',
  },
  {
    slug: 'uzak-dogu',
    restaurant: 'Tokyo Wok',
    style: 'egik',
    sections: [
      { title: 'SUSHI', items: [['California Roll (8li)', '280 ₺'], ['Philadelphia Roll', '300 ₺']] },
      { title: 'WOK', items: [['Tavuklu Noodle', '240 ₺'], ['Tatlı Ekşi Soslu Tavuk', '260 ₺']] },
      { title: 'ÇORBA', items: [['Miso Çorbası', '120 ₺']] },
    ],
    typed: 'California Roll, Philadelphia Roll, Tavuklu Noodle, Tatlı Ekşi Soslu Tavuk, Miso Çorbası',
    single: 'Ramen',
  },
  {
    slug: 'dunya-mutfagi',
    restaurant: 'Global Street Kitchen',
    style: 'tahta',
    sections: [
      { title: 'MEKSİKA', items: [['Burrito', '260 ₺'], ['Tacos (3lü)', '240 ₺'], ['Quesadilla', '220 ₺'], ['Nachos', '180 ₺'], ['Tavuk Fajita', '280 ₺']] },
    ],
    typed: 'burrito, tacos, quesadilla, nachos, tavuk fajita',
    single: 'Shawarma Tabağı',
  },
];

/** The canonical product names printed on a menu, for accuracy scoring. */
export const itemsOf = (menu) => menu.sections.flatMap((section) => section.items.map(([name]) => name));

/** Photos that already live in the repository (backend/test/fixtures/images): real photos, not rendered. */
export const REPO_PHOTOS = [
  { id: 'repo-kebapci', file: 'backend/test/fixtures/images/menu-kebapci.jpg', slug: 'kebap-izgara' },
  { id: 'repo-pideci', file: 'backend/test/fixtures/images/menu-pideci.jpg', slug: 'pide-lahmacun' },
  { id: 'repo-tatli-kafe', file: 'backend/test/fixtures/images/menu-tatli-kafe.jpg', slug: 'tatli' },
];
