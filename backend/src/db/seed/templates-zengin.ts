import type { TemplateOptionGroup } from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { CUISINE_SLUGS, type CuisineSlug } from './cuisines.js';
import {
  aciSeviyesi,
  adet,
  boy,
  gramaj,
  hamurSecimi,
  multi,
  pilavSecimi,
  pismeDerecesi,
  porsiyon,
  sekerOrani,
  single,
  sosSecimi,
  surupSecimi,
  sutSecimi,
  yanindaGelen,
} from './groups.js';
import { type SeedTemplate, template } from './template-types.js';
import { drink } from './templates-kombo-icecek.js';

/**
 * Fourth wave (D-206): every cuisine toward the opening targets the team works with.
 *
 * Measured before writing this: 424 templates, 11–26 per cuisine, against opening targets of 13–55 products. A menu
 * can only be filled from the pool — instantly, with curated options, and even when the model is busy — as far as
 * the pool reaches. Two kinds of rows:
 *
 *  - the dishes each kitchen is missing most, hand-written, biggest gaps first (pastane, pizza, uzak doğu, kahve,
 *    dünya mutfağı, balık, meze, kahvaltı, burger, steak …);
 *  - a standard set of packaged drinks for every cuisine, because every store must open with at least ten drinks;
 *    a packaged drink is a plain panel row (D-175), so these carry no description and no options.
 */

interface Dish {
  aliases?: readonly string[];
  groups?: readonly TemplateOptionGroup[];
  removable?: readonly string[];
  extras?: readonly string[];
  portion?: string;
  tags?: readonly string[];
  allergens?: readonly string[];
  serving?: string;
  upsell?: string;
}

const dish = (cuisine: CuisineSlug, importance: number, name: string, description: string, d: Dish = {}): SeedTemplate =>
  template({
    cuisine,
    importance,
    aliases: d.aliases ?? [],
    name,
    description,
    servingNote: d.serving ?? '',
    portionInfo: d.portion ?? '',
    groups: d.groups ?? [],
    removable: d.removable ?? [],
    extras: d.extras ?? [],
    tags: d.tags ?? [],
    allergens: d.allergens ?? [],
    upsell: d.upsell ?? '',
  });

// ---- shared groups ------------------------------------------------------------------------------------------------

const pizzaBoy = () => boy(['Küçük', 'Orta', 'Büyük'], 1);
const pizzaEkstra = () => multi('Ekstra Malzeme', ['Kaşar', 'Mantar', 'Sucuk', 'Mısır', 'Siyah Zeytin', 'Jalapeno Biber'], { mode: 'surcharge', maxSelect: 4 });
const sushiAdet = () => adet(['4 Adet', '8 Adet', '12 Adet'], 1);
const asyaSos = () => sosSecimi(['Soya Sosu', 'Wasabi', 'Zencefil Turşusu', 'Teriyaki Sos', 'Acı Mayonez']);
const kahveBoy = () => boy(['Küçük', 'Orta', 'Büyük'], 1);
const buz = () => single('Buz', ['Normal Buz', 'Az Buz', 'Buzsuz'], { required: true, defaultIndex: 0 });
const burgerPisme = () => single('Köfte Pişme Derecesi', ['Orta', 'Orta İyi', 'İyi Pişmiş'], { required: true, defaultIndex: 1 });
const burgerSos = () => sosSecimi(['Ketçap', 'Mayonez', 'Barbekü Sos', 'Ranch Sos', 'Acı Sos']);
const burgerMenu = () => single('Menü', ['Sadece Burger', 'Patates ve İçecekle Menü', 'Büyük Menü'], { required: true, defaultIndex: 0 });
const tavukSos = () => sosSecimi(['Ranch Sos', 'Barbekü Sos', 'Ballı Hardal', 'Acı Sos', 'Sarımsaklı Mayonez']);
const garnitur = () => yanindaGelen(['Patates Kızartması', 'Patates Püresi', 'Izgara Sebze', 'Pilav', 'Mevsim Yeşillik'], 2);
const balikYani = () => yanindaGelen(['Roka', 'Soğan', 'Limon', 'Mevsim Salata', 'Patates'], 3);
const mezeBoy = () => porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1);
const ekmekCesidi = () => single('Ekmek Seçimi', ['Beyaz Ekmek', 'Tam Buğday', 'Çavdar Ekmeği', 'Bazlama'], { required: true, defaultIndex: 0 });
const tostEkstra = () => multi('Ekstra Malzeme', ['Kaşar', 'Sucuk', 'Domates', 'Turşu', 'Biber'], { mode: 'surcharge', maxSelect: 3 });
const pogacaAdet = () => adet(['1 Adet', '3 Adet', '6 Adet', '12 Adet'], 0);
const tatliPorsiyon = () => porsiyon(['1 Porsiyon', '1,5 Porsiyon', '2 Porsiyon'], 0);
const tatliYani = () => yanindaGelen(['Kaymak', 'Dondurma', 'Antep Fıstığı', 'Ceviz'], 2);
const salataSos = () => sosSecimi(['Zeytinyağı Limon', 'Balzamik Sos', 'Hardallı Sos', 'Yoğurtlu Sos', 'Nar Ekşisi']);
const salataEkstra = () => multi('Ekstra Malzeme', ['Izgara Tavuk', 'Ton Balığı', 'Hellim', 'Avokado', 'Ceviz'], { mode: 'surcharge', maxSelect: 3 });
const durumMenu = () => single('Menü', ['Sadece Dürüm', 'Ayranlı Menü', 'Patates ve Ayranlı Menü'], { required: true, defaultIndex: 0 });

// ---- hand-written dishes ------------------------------------------------------------------------------------------

const DISHES: readonly SeedTemplate[] = [
  // ---- Pizza ---------------------------------------------------------------------------------------------------
  dish('pizza', 78, 'Sosisli Pizza', 'Domates sosu, mozzarella ve dilim dilim sosis.', {
    groups: [pizzaBoy(), hamurSecimi(), pizzaEkstra()],
    removable: ['Sosis', 'Mısır', 'Kekik'],
    extras: ['Ekstra Kaşar', 'Ekstra Sosis'],
    tags: ['pizza'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 74, 'Akdeniz Pizza', 'Mozzarella, domates, siyah zeytin, biber ve kekik.', {
    groups: [pizzaBoy(), hamurSecimi(), pizzaEkstra()],
    removable: ['Siyah Zeytin', 'Biber', 'Soğan'],
    extras: ['Beyaz Peynir', 'Ekstra Zeytin'],
    tags: ['pizza', 'vejetaryen'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 72, 'Füme Etli Pizza', 'Füme et, mozzarella, mantar ve domates sosu.', {
    groups: [pizzaBoy(), hamurSecimi(), pizzaEkstra()],
    removable: ['Mantar', 'Biber', 'Soğan'],
    extras: ['Ekstra Füme Et', 'Ekstra Kaşar'],
    tags: ['pizza'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 70, 'Acılı Mexicano Pizza', 'Kıyma, jalapeno, mısır ve acılı domates sosu.', {
    aliases: ['Mexicano Pizza', 'Meksika Pizza'],
    groups: [pizzaBoy(), hamurSecimi(), aciSeviyesi(2), pizzaEkstra()],
    removable: ['Jalapeno Biber', 'Mısır', 'Soğan'],
    extras: ['Ekstra Kıyma', 'Ekstra Jalapeno'],
    tags: ['pizza', 'acılı'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 66, 'Ispanaklı Pizza', 'Ispanak, beyaz peynir, mozzarella ve sarımsaklı sos.', {
    groups: [pizzaBoy(), hamurSecimi(), pizzaEkstra()],
    removable: ['Sarımsak', 'Beyaz Peynir'],
    extras: ['Ekstra Peynir', 'Ekstra Ispanak'],
    tags: ['pizza', 'vejetaryen'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 64, 'Hawaii Pizza', 'Mozzarella, füme hindi, ananas ve domates sosu.', {
    aliases: ['Ananaslı Pizza'],
    groups: [pizzaBoy(), hamurSecimi(), pizzaEkstra()],
    removable: ['Ananas', 'Füme Hindi'],
    extras: ['Ekstra Ananas', 'Ekstra Kaşar'],
    tags: ['pizza'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 66, 'Calzone', 'Kapalı pizza hamuru, kaşar, sucuk ve mantar.', {
    groups: [single('İç Harç', ['Karışık', 'Tavuklu', 'Sucuklu', 'Sebzeli'], { required: true, defaultIndex: 0 })],
    removable: ['Mantar', 'Sucuk'],
    extras: ['Ekstra Kaşar'],
    tags: ['pizza'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 70, 'Mozzarella Çubukları', 'Çıtır kaplamalı mozzarella, yanında marinara sosu.', {
    groups: [adet(['4 Adet', '6 Adet', '8 Adet'], 1), sosSecimi(['Marinara Sos', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['ara sıcak'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pizza', 68, 'Elma Dilim Patates', 'Kabuklu elma dilim patates, baharatlı ve çıtır.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    removable: ['Baharat'],
    tags: ['yan ürün'],
  }),
  dish('pizza', 66, 'Acılı Tavuk Kanat', 'Fırında acılı soslu tavuk kanatları, ranch sosla.', {
    aliases: ['Buffalo Kanat', 'Hot Wings'],
    groups: [adet(['6 Adet', '9 Adet', '12 Adet'], 0), aciSeviyesi(3)],
    tags: ['ara sıcak', 'acılı'],
  }),
  dish('pizza', 62, 'Sezar Salata', 'Marul, ızgara tavuk, kruton, parmesan ve sezar sos.', {
    groups: [salataEkstra()],
    removable: ['Kruton', 'Parmesan'],
    tags: ['salata'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('pizza', 60, 'Çikolatalı Sufle', 'İçi akışkan sıcak çikolatalı kek, fırından taze.', {
    groups: [tatliYani()],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('pizza', 58, 'Tiramisu', 'Kahveli kedi dili, mascarpone kreması ve kakao.', {
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),

  // ---- Uzak Doğu -----------------------------------------------------------------------------------------------
  dish('uzak-dogu', 76, 'Spicy Tuna Roll', 'Acı soslu ton balığı, salatalık ve susamlı pirinç.', {
    aliases: ['Acılı Ton Balıklı Roll'],
    groups: [sushiAdet(), asyaSos()],
    removable: ['Susam', 'Acı Sos'],
    tags: ['sushi'],
    allergens: ['Balık', 'Susam', 'Soya'],
  }),
  dish('uzak-dogu', 74, 'Somon Avokado Roll', 'Taze somon, avokado ve pirinç, nori yaprağında.', {
    aliases: ['Salmon Avocado Roll'],
    groups: [sushiAdet(), asyaSos()],
    removable: ['Avokado', 'Susam'],
    tags: ['sushi'],
    allergens: ['Balık', 'Susam', 'Soya'],
  }),
  dish('uzak-dogu', 72, 'Somon Maki', 'Nori yaprağına sarılı somon ve sushi pirinci.', {
    aliases: ['Sake Maki'],
    groups: [sushiAdet(), asyaSos()],
    tags: ['sushi'],
    allergens: ['Balık', 'Soya'],
  }),
  dish('uzak-dogu', 70, 'Dragon Roll', 'Tempura karides üzerinde avokado dilimleri ve unagi sos.', {
    groups: [sushiAdet(), asyaSos()],
    removable: ['Unagi Sos', 'Avokado'],
    tags: ['sushi'],
    allergens: ['Kabuklu deniz ürünü', 'Gluten', 'Soya'],
  }),
  dish('uzak-dogu', 72, 'Karışık Sushi Seti', 'Roll, nigiri ve maki çeşitlerinden oluşan set.', {
    aliases: ['Sushi Seti', 'Sushi Tabağı'],
    groups: [adet(['12 Parça', '18 Parça', '24 Parça', '36 Parça'], 0), asyaSos()],
    tags: ['sushi'],
    allergens: ['Balık', 'Kabuklu deniz ürünü', 'Soya', 'Susam'],
  }),
  dish('uzak-dogu', 64, 'Edamame', 'Haşlanmış soya fasulyesi, deniz tuzu ile servis.', {
    groups: [single('Sos', ['Deniz Tuzlu', 'Acılı Sarımsaklı', 'Teriyaki'], { required: true, defaultIndex: 0 })],
    tags: ['başlangıç', 'vejetaryen'],
    allergens: ['Soya'],
  }),
  dish('uzak-dogu', 72, 'Tavuklu Ramen', 'Tavuk suyunda ramen eriştesi, yumurta ve yeşil soğan.', {
    aliases: ['Ramen'],
    groups: [boy(['Normal', 'Büyük'], 0), aciSeviyesi(0), multi('Ekstra Malzeme', ['Haşlanmış Yumurta', 'Mantar', 'Mısır', 'Nori'], { mode: 'surcharge' })],
    removable: ['Yumurta', 'Yeşil Soğan'],
    tags: ['çorba', 'noodle'],
    allergens: ['Gluten', 'Yumurta', 'Soya'],
  }),
  dish('uzak-dogu', 70, 'Dana Etli Noodle', 'Wokta dana eti, sebzeler ve yumurtalı erişte.', {
    groups: [boy(['Normal', 'Büyük'], 0), aciSeviyesi(0), asyaSos()],
    removable: ['Soğan', 'Biber', 'Havuç'],
    extras: ['Ekstra Dana Eti'],
    tags: ['noodle'],
    allergens: ['Gluten', 'Yumurta', 'Soya'],
  }),
  dish('uzak-dogu', 66, 'Brokolili Dana', 'Wokta dana eti, brokoli ve istiridye sosu.', {
    aliases: ['Beef Broccoli'],
    groups: [pilavSecimi(['Beyaz Pilav', 'Wok Pilav', 'Noodle'])],
    removable: ['Susam'],
    tags: ['wok'],
    allergens: ['Soya', 'Kabuklu deniz ürünü'],
  }),
  dish('uzak-dogu', 68, 'Susamlı Tavuk', 'Çıtır tavuk parçaları, tatlı soya sos ve susam.', {
    groups: [pilavSecimi(['Beyaz Pilav', 'Wok Pilav', 'Noodle']), aciSeviyesi(0)],
    removable: ['Susam', 'Yeşil Soğan'],
    tags: ['wok'],
    allergens: ['Gluten', 'Susam', 'Soya'],
  }),
  dish('uzak-dogu', 64, 'Karides Tempura', 'Çıtır tempura kaplı karides, tatlı ekşi sosla.', {
    groups: [adet(['4 Adet', '6 Adet', '8 Adet'], 1), sosSecimi(['Tatlı Ekşi Sos', 'Teriyaki Sos', 'Acı Mayonez'])],
    tags: ['başlangıç'],
    allergens: ['Kabuklu deniz ürünü', 'Gluten'],
  }),
  dish('uzak-dogu', 60, 'Wonton Çorbası', 'Kıymalı wonton mantıları, sebzeli berrak et suyunda.', {
    groups: [boy(['Kase', 'Büyük Kase'], 0), aciSeviyesi(0)],
    removable: ['Yeşil Soğan'],
    tags: ['çorba'],
    allergens: ['Gluten', 'Soya'],
  }),
  dish('uzak-dogu', 62, 'Yakisoba', 'Japon usulü sebzeli tavuklu erişte, yakisoba sosuyla.', {
    groups: [single('Protein', ['Tavuklu', 'Dana Etli', 'Karidesli', 'Sebzeli'], { required: true, defaultIndex: 0 }), aciSeviyesi(0)],
    removable: ['Lahana', 'Havuç'],
    tags: ['noodle'],
    allergens: ['Gluten', 'Soya'],
  }),
  dish('uzak-dogu', 56, 'Dondurmalı Mochi', 'Pirinç hamuruna sarılı dondurma, üç farklı aromada.', {
    aliases: ['Mochi'],
    groups: [adet(['2 Adet', '3 Adet', '6 Adet'], 1), multi('Aroma', ['Matcha', 'Çilek', 'Mango', 'Çikolata'], { maxSelect: 3 })],
    tags: ['tatlı'],
    allergens: ['Süt ürünü'],
  }),

  // ---- Pastane & Fırın ------------------------------------------------------------------------------------------
  dish('pastane-firin', 74, 'Zeytinli Poğaça', 'Siyah zeytin ezmeli yumuşak poğaça, günlük fırından.', {
    groups: [pogacaAdet()],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('pastane-firin', 74, 'Kaşarlı Poğaça', 'Bol kaşarlı, üzeri susamlı yumuşak poğaça.', {
    groups: [pogacaAdet()],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta', 'Susam'],
  }),
  dish('pastane-firin', 70, 'Dereotlu Poğaça', 'Beyaz peynir ve dereotlu harçla sabah poğaçası.', {
    groups: [pogacaAdet()],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('pastane-firin', 66, 'Haşhaşlı Çörek', 'Haşhaş ezmeli katmerli çörek, hafif tatlı ve yumuşak.', {
    groups: [adet(['1 Adet', '3 Adet', '6 Adet'], 0)],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pastane-firin', 60, 'Susamlı Çubuk', 'Çıtır tuzlu çubuklar, bol susam ve çörek otu.', {
    groups: [gramaj(['100 g', '250 g', '500 g'], 1)],
    tags: ['kuru pasta'],
    allergens: ['Gluten', 'Susam'],
  }),
  dish('pastane-firin', 64, 'Tuzlu Kurabiye', 'Tereyağlı tuzlu kurabiye, çörek otu ve susamlı.', {
    aliases: ['Tuzlu Kuru Pasta'],
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0)],
    tags: ['kuru pasta'],
    allergens: ['Gluten', 'Süt ürünü', 'Susam'],
  }),
  dish('pastane-firin', 62, 'Cevizli Kurabiye', 'Bol cevizli tereyağlı kurabiye, pudra şekerli.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0)],
    tags: ['kuru pasta'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('pastane-firin', 66, 'Mozaik Pasta', 'Bisküvili kakaolu mozaik pasta, soğuk servis edilir.', {
    groups: [single('Boy', ['Dilim', 'Bütün'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['pasta'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pastane-firin', 68, 'Profiterol', 'Krema dolgulu toplar üzerinde sıcak çikolata sosu.', {
    groups: [tatliPorsiyon()],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('pastane-firin', 66, 'Şöbiyet', 'Kaymak ve fıstık dolgulu şerbetli baklava dilimi.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0)],
    tags: ['şerbetli'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('pastane-firin', 70, 'Fıstıklı Baklava', 'İnce yufka katları, Antep fıstığı ve şerbet.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0), tatliYani()],
    tags: ['şerbetli'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('pastane-firin', 62, 'Tulumba Tatlısı', 'Çıtır kızartılmış hamur, soğuk şerbete batırılmış halde.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0)],
    tags: ['şerbetli'],
    allergens: ['Gluten'],
  }),
  dish('pastane-firin', 62, 'Milföy', 'Kat kat milföy hamuru, vanilyalı krema ve pudra.', {
    aliases: ['Milföy Tatlısı'],
    groups: [adet(['1 Adet', '2 Adet', '4 Adet'], 0)],
    tags: ['pasta'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('pastane-firin', 60, 'Ekşi Mayalı Ekmek', 'Uzun mayalanmış ekşi mayalı taş fırın ekmeği.', {
    groups: [single('Boy', ['Yarım', 'Tam'], { required: true, mode: 'sets_base', defaultIndex: 1 })],
    tags: ['ekmek'],
    allergens: ['Gluten'],
  }),
  dish('pastane-firin', 56, 'Tam Buğday Ekmeği', 'Tam buğday unuyla hazırlanan lifli somun ekmek.', {
    tags: ['ekmek'],
    allergens: ['Gluten'],
  }),
  dish('pastane-firin', 64, 'Çikolatalı Brownie', 'Yoğun kakaolu ıslak brownie, cevizli ya da sade.', {
    groups: [single('Çeşit', ['Sade', 'Cevizli', 'Fındıklı'], { required: true, defaultIndex: 0 })],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('pastane-firin', 64, 'San Sebastian Cheesecake', 'Fırında karamelize yüzeyli, içi kremamsı cheesecake.', {
    groups: [single('Sos', ['Sossuz', 'Çikolata Sosu', 'Frambuaz Sosu'], { required: true, defaultIndex: 0 })],
    tags: ['tatlı'],
    allergens: ['Süt ürünü', 'Yumurta'],
  }),
  dish('pastane-firin', 62, 'Türk Kahvesi', 'Közde pişen köpüklü Türk kahvesi, lokumla birlikte.', {
    groups: [sekerOrani(), single('Fincan', ['Tek', 'Duble'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['sıcak içecek'],
  }),
  dish('pastane-firin', 56, 'Sıcak Çikolata', 'Sütle hazırlanan yoğun kıvamlı sıcak çikolata.', {
    groups: [kahveBoy(), sutSecimi()],
    extras: ['Krema', 'Marshmallow'],
    tags: ['sıcak içecek'],
    allergens: ['Süt ürünü'],
  }),

  // ---- Kahve & İçecek -------------------------------------------------------------------------------------------
  dish('kafe-icecek', 72, 'Caramel Macchiato', 'Vanilyalı süt, espresso ve üzerinde karamel sosu.', {
    aliases: ['Karamel Macchiato'],
    groups: [kahveBoy(), sutSecimi(), buz()],
    extras: ['Ekstra Shot', 'Karamel Sos'],
    tags: ['kahve'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 66, 'Flat White', 'Çift shot espresso ve ince kadife süt köpüğü.', {
    groups: [kahveBoy(), sutSecimi()],
    extras: ['Ekstra Shot'],
    tags: ['kahve'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 58, 'Cortado', 'Espresso ve eşit miktarda sıcak süt, küçük bardakta.', {
    groups: [sutSecimi(), multi('Şurup', ['Vanilya', 'Karamel', 'Fındık'], { mode: 'surcharge', maxSelect: 1 })],
    tags: ['kahve'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 64, 'Cold Brew', 'Soğuk suda uzun süre demlenmiş yumuşak içimli kahve.', {
    groups: [kahveBoy(), buz(), sutSecimi()],
    tags: ['soğuk kahve'],
  }),
  dish('kafe-icecek', 62, 'Iced Mocha', 'Espresso, çikolata sosu, soğuk süt ve buz.', {
    aliases: ['Buzlu Mocha'],
    groups: [kahveBoy(), sutSecimi(), buz()],
    extras: ['Krema', 'Ekstra Shot'],
    tags: ['soğuk kahve'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 64, 'Chai Tea Latte', 'Baharatlı chai çayı ve buharda ısıtılmış süt.', {
    aliases: ['Chai Latte'],
    groups: [kahveBoy(), sutSecimi(), single('Sıcaklık', ['Sıcak', 'Buzlu'], { required: true, defaultIndex: 0 })],
    tags: ['çay'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 62, 'Matcha Latte', 'Japon matcha çayı, süt ve hafif tatlandırma.', {
    groups: [kahveBoy(), sutSecimi(), single('Sıcaklık', ['Sıcak', 'Buzlu'], { required: true, defaultIndex: 0 })],
    tags: ['çay'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 60, 'Dibek Kahvesi', 'Dibekte dövülmüş yumuşak içimli geleneksel Türk kahvesi.', {
    groups: [sekerOrani(), single('Fincan', ['Tek', 'Duble'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['kahve'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 56, 'Menengiç Kahvesi', 'Menengiç tanelerinden sütle pişen kafeinsiz yöresel kahve.', {
    groups: [sekerOrani()],
    tags: ['kahve'],
    allergens: ['Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('kafe-icecek', 60, 'Çilekli Milkshake', 'Çilekli dondurma ve sütle köpürtülmüş soğuk içecek.', {
    groups: [kahveBoy()],
    extras: ['Krema', 'Taze Çilek'],
    tags: ['soğuk içecek'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 62, 'Milkshake', 'Dondurma ve soğuk sütle köpürtülmüş yoğun içecek.', {
    groups: [kahveBoy(), single('Aroma', ['Vanilya', 'Çikolata', 'Çilek', 'Karamel', 'Muz'], { required: true, defaultIndex: 0 })],
    extras: ['Krema'],
    tags: ['soğuk içecek'],
    allergens: ['Süt ürünü'],
  }),
  dish('kafe-icecek', 58, 'Frozen', 'Buzla çekilmiş meyveli ferahlatıcı içecek, pipetle servis.', {
    groups: [kahveBoy(), single('Aroma', ['Çilek', 'Mango', 'Karpuz', 'Orman Meyveli', 'Limon'], { required: true, defaultIndex: 0 })],
    tags: ['soğuk içecek'],
  }),
  dish('kafe-icecek', 58, 'Kruvasan', 'Tereyağlı kat kat kruvasan, günlük taze pişirilir.', {
    groups: [single('Çeşit', ['Sade', 'Çikolatalı', 'Kaşarlı', 'Badem Kremalı'], { required: true, defaultIndex: 0 })],
    tags: ['atıştırmalık'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('kafe-icecek', 58, 'Kaşarlı Tost', 'Kaşar peynirli bazlama ya da tost ekmeğinde.', {
    groups: [ekmekCesidi(), tostEkstra()],
    tags: ['atıştırmalık'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('kafe-icecek', 60, 'San Sebastian Cheesecake', 'Fırında karamelize yüzeyli, içi kremamsı cheesecake.', {
    groups: [single('Sos', ['Sossuz', 'Çikolata Sosu', 'Frambuaz Sosu'], { required: true, defaultIndex: 0 })],
    tags: ['tatlı'],
    allergens: ['Süt ürünü', 'Yumurta'],
  }),
  dish('kafe-icecek', 58, 'Tiramisu', 'Kahveli kedi dili, mascarpone kreması ve kakao.', {
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('kafe-icecek', 56, 'Kurabiye', 'Damla çikolatalı iri kurabiye, kahvenin yanına.', {
    groups: [adet(['1 Adet', '3 Adet', '6 Adet'], 0)],
    tags: ['atıştırmalık'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),

  // ---- Dünya Mutfağı & Cafe -------------------------------------------------------------------------------------
  dish('dunya-mutfagi', 70, 'Club Sandviç', 'Tavuk, hindi füme, cheddar, domates ve marul.', {
    groups: [ekmekCesidi(), yanindaGelen(['Patates Kızartması', 'Cips', 'Mevsim Yeşillik'], 1)],
    removable: ['Domates', 'Marul', 'Mayonez'],
    tags: ['sandviç'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('dunya-mutfagi', 68, 'Sezar Salata', 'Marul, ızgara tavuk, kruton, parmesan ve sezar sos.', {
    groups: [salataEkstra()],
    removable: ['Kruton', 'Parmesan'],
    tags: ['salata'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('dunya-mutfagi', 66, 'Enchilada', 'Tortilla içinde tavuk, kaşar ve acılı enchilada sosu.', {
    groups: [single('İç Harç', ['Tavuklu', 'Etli', 'Sebzeli'], { required: true, defaultIndex: 0 }), aciSeviyesi(1)],
    removable: ['Jalapeno Biber', 'Soğan'],
    extras: ['Guacamole', 'Ekşi Krema'],
    tags: ['meksika'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('dunya-mutfagi', 68, 'Tavuk Shawarma', 'Marine tavuk, sarımsaklı sos ve turşuyla lavaşta.', {
    aliases: ['Shawarma'],
    groups: [single('Servis', ['Dürüm', 'Tabak'], { required: true, defaultIndex: 0 }), sosSecimi(['Sarımsaklı Sos', 'Tahin Sos', 'Acı Sos'])],
    removable: ['Turşu', 'Soğan', 'Domates'],
    tags: ['orta doğu'],
    allergens: ['Gluten'],
  }),
  dish('dunya-mutfagi', 66, 'Tavuk Tikka Masala', 'Baharatlı domates kremalı sosta tavuk, basmati pilavla.', {
    aliases: ['Tikka Masala'],
    groups: [aciSeviyesi(1), single('Yanında', ['Basmati Pilav', 'Naan Ekmeği', 'Pilav ve Naan'], { required: true, defaultIndex: 0 })],
    tags: ['hint'],
    allergens: ['Süt ürünü'],
  }),
  dish('dunya-mutfagi', 64, 'Tereyağlı Tavuk Köri', 'Tereyağlı domatesli köri sosunda yumuşak tavuk parçaları.', {
    aliases: ['Butter Chicken'],
    groups: [aciSeviyesi(0), single('Yanında', ['Basmati Pilav', 'Naan Ekmeği', 'Pilav ve Naan'], { required: true, defaultIndex: 0 })],
    tags: ['hint'],
    allergens: ['Süt ürünü'],
  }),
  dish('dunya-mutfagi', 62, 'Falafel Tabağı', 'Nohut köftesi, humus, tahin sos ve salata.', {
    groups: [adet(['4 Adet', '6 Adet', '8 Adet'], 1)],
    removable: ['Tahin Sos', 'Soğan'],
    tags: ['vejetaryen'],
    allergens: ['Susam'],
  }),
  dish('dunya-mutfagi', 62, 'Pankek', 'Puf puf pankekler, akçaağaç şurubu ve tereyağı.', {
    groups: [adet(['3 Adet', '5 Adet'], 0), multi('Yanında', ['Çikolata Sos', 'Muz', 'Çilek', 'Bal', 'Dondurma'], { mode: 'surcharge', maxSelect: 3 })],
    tags: ['tatlı', 'kahvaltı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('dunya-mutfagi', 62, 'Waffle', 'Sıcak waffle hamuru, çikolata, meyve ve fındıkla.', {
    groups: [multi('Malzemeler', ['Muz', 'Çilek', 'Kivi', 'Fındık', 'Hindistan Cevizi', 'Dondurma'], { maxSelect: 4 })],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('dunya-mutfagi', 60, 'Kruvasan Sandviç', 'Kruvasan içinde hindi füme, cheddar ve yeşillik.', {
    groups: [single('İç Harç', ['Hindi Füme', 'Somon', 'Ton Balığı', 'Peynirli'], { required: true, defaultIndex: 0 })],
    removable: ['Domates', 'Marul'],
    tags: ['sandviç'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('dunya-mutfagi', 58, 'Penne Alfredo', 'Kremalı parmesan sosunda tavuklu ve mantarlı penne.', {
    groups: [single('Protein', ['Tavuklu', 'Mantarlı', 'Karidesli'], { required: true, defaultIndex: 0 })],
    removable: ['Mantar'],
    extras: ['Ekstra Parmesan'],
    tags: ['makarna'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('dunya-mutfagi', 58, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),
  dish('dunya-mutfagi', 58, 'Çikolatalı Brownie', 'Yoğun kakaolu ıslak brownie, cevizli ya da sade.', {
    groups: [single('Çeşit', ['Sade', 'Cevizli', 'Fındıklı'], { required: true, defaultIndex: 0 }), multi('Yanında', ['Dondurma', 'Çikolata Sos'], { mode: 'surcharge' })],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('dunya-mutfagi', 60, 'Latte', 'Espresso ve bol sıcak süt, ince süt köpüğüyle.', {
    groups: [kahveBoy(), sutSecimi(), surupSecimi()],
    tags: ['kahve'],
    allergens: ['Süt ürünü'],
  }),

  // ---- Balık & Deniz Ürünleri -----------------------------------------------------------------------------------
  dish('balik-deniz', 72, 'Levrek Buğulama', 'Sebzeli buğulama levrek fileto, domates ve biberle.', {
    groups: [balikYani()],
    removable: ['Soğan', 'Biber'],
    tags: ['balık'],
    allergens: ['Balık'],
  }),
  dish('balik-deniz', 66, 'Lüfer Izgara', 'Mevsiminde lüfer, közde ızgara, roka ve soğanla.', {
    groups: [balikYani()],
    tags: ['balık', 'mevsim'],
    allergens: ['Balık'],
  }),
  dish('balik-deniz', 66, 'Karides Tava', 'Tereyağında sarımsaklı karides, pul biber ve maydanozla.', {
    aliases: ['Tereyağlı Karides'],
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), aciSeviyesi(1)],
    removable: ['Sarımsak', 'Pul Biber'],
    tags: ['deniz ürünü'],
    allergens: ['Kabuklu deniz ürünü', 'Süt ürünü'],
  }),
  dish('balik-deniz', 62, 'Ahtapot Salatası', 'Haşlanmış ahtapot, zeytinyağı, limon ve maydanoz.', {
    groups: [mezeBoy()],
    removable: ['Soğan', 'Maydanoz'],
    tags: ['meze', 'deniz ürünü'],
    allergens: ['Yumuşakçalar'],
  }),
  dish('balik-deniz', 66, 'Midye Tava', 'Çıtır kaplamalı midye tava, tarator sosla servis.', {
    groups: [adet(['10 Adet', '20 Adet', '30 Adet'], 0)],
    removable: ['Tarator Sos'],
    tags: ['deniz ürünü'],
    allergens: ['Yumuşakçalar', 'Gluten', 'Sert kabuklu yemiş'],
  }),
  dish('balik-deniz', 60, 'Balık Çorbası', 'Kremalı balık çorbası, havuç, patates ve limonla.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
    allergens: ['Balık', 'Süt ürünü'],
  }),
  dish('balik-deniz', 62, 'Sardalya Izgara', 'Kömür ateşinde ızgara sardalya, limon ve yeşillikle.', {
    groups: [balikYani()],
    tags: ['balık', 'mevsim'],
    allergens: ['Balık'],
  }),
  dish('balik-deniz', 62, 'Kalamar Izgara', 'Marine edilmiş bütün kalamar ızgara, roka yatağında.', {
    groups: [balikYani(), sosSecimi(['Tarator Sos', 'Limonlu Sos', 'Acı Sos'])],
    tags: ['deniz ürünü'],
    allergens: ['Yumuşakçalar'],
  }),
  dish('balik-deniz', 60, 'Hamsili Pilav', 'Hamsi kaplı fırın pirinç pilavı, Karadeniz usulü.', {
    groups: [porsiyon(['1 Porsiyon', '1,5 Porsiyon'], 0)],
    tags: ['balık'],
    allergens: ['Balık'],
  }),
  dish('balik-deniz', 60, 'Barbun Tava', 'Una bulanmış barbun tava, roka ve limonla.', {
    groups: [balikYani()],
    tags: ['balık', 'mevsim'],
    allergens: ['Balık', 'Gluten'],
  }),
  dish('balik-deniz', 58, 'Deniz Mahsullü Makarna', 'Karides, midye ve kalamarlı domatesli linguine makarna.', {
    groups: [aciSeviyesi(0)],
    tags: ['makarna', 'deniz ürünü'],
    allergens: ['Gluten', 'Kabuklu deniz ürünü', 'Yumuşakçalar'],
  }),
  dish('balik-deniz', 56, 'Acılı Ezme', 'Domates, biber ve soğanla hazırlanan acılı ezme.', {
    groups: [mezeBoy()],
    tags: ['meze', 'acılı'],
  }),

  // ---- Meze ----------------------------------------------------------------------------------------------------
  dish('meze', 66, 'Girit Ezmesi', 'Beyaz peynir, lor, ceviz ve fesleğenli Ege ezmesi.', {
    groups: [mezeBoy()],
    tags: ['soğuk meze'],
    allergens: ['Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('meze', 62, 'Közlenmiş Biber', 'Közde pişmiş kırmızı biber, sarımsaklı zeytinyağıyla.', {
    groups: [mezeBoy()],
    removable: ['Sarımsak'],
    tags: ['soğuk meze', 'vegan'],
  }),
  dish('meze', 58, 'Topik', 'Nohut, tahin ve soğanla hazırlanan Ermeni mezesi.', {
    groups: [mezeBoy()],
    tags: ['soğuk meze', 'vegan'],
    allergens: ['Susam'],
  }),
  dish('meze', 64, 'Cacık', 'Süzme yoğurt, salatalık, sarımsak ve nane ile.', {
    groups: [mezeBoy()],
    removable: ['Sarımsak'],
    tags: ['soğuk meze'],
    allergens: ['Süt ürünü'],
  }),
  dish('meze', 62, 'Zeytinyağlı Enginar', 'Bezelye ve havuçla pişen zeytinyağlı enginar kalbi.', {
    groups: [mezeBoy()],
    tags: ['zeytinyağlı', 'vegan'],
  }),
  dish('meze', 64, 'Kısır', 'İnce bulgur, nar ekşisi, salça ve taze yeşillik.', {
    groups: [mezeBoy()],
    removable: ['Soğan', 'Maydanoz'],
    tags: ['soğuk meze', 'vegan'],
    allergens: ['Gluten'],
  }),
  dish('meze', 64, 'Mercimek Köftesi', 'Kırmızı mercimek ve bulgurdan yeşillikli köfte, marulla.', {
    groups: [adet(['6 Adet', '10 Adet', '16 Adet'], 1)],
    tags: ['soğuk meze', 'vegan'],
    allergens: ['Gluten'],
  }),
  dish('meze', 62, 'Paçanga Böreği', 'Pastırma ve kaşar dolgulu çıtır yufka böreği.', {
    groups: [adet(['2 Adet', '4 Adet', '6 Adet'], 1)],
    tags: ['ara sıcak'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('meze', 62, 'Sigara Böreği', 'Beyaz peynirli maydanozlu yufka, çıtır kızartılmış.', {
    groups: [adet(['4 Adet', '6 Adet', '10 Adet'], 1)],
    tags: ['ara sıcak'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('meze', 58, 'Peynir Tabağı', 'Ezine, kaşar, tulum peyniri, ceviz ve kavun.', {
    groups: [mezeBoy()],
    tags: ['soğuk meze'],
    allergens: ['Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('meze', 60, 'Kalamar Tava', 'Çıtır kaplamalı kalamar halkaları, tarator sosla.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1)],
    removable: ['Tarator Sos'],
    tags: ['ara sıcak', 'deniz ürünü'],
    allergens: ['Yumuşakçalar', 'Gluten', 'Sert kabuklu yemiş'],
  }),

  // ---- Kahvaltı ------------------------------------------------------------------------------------------------
  dish('kahvalti', 70, 'Bal Kaymak', 'Manda kaymağı ve süzme çiçek balı, ekmekle.', {
    groups: [porsiyon(['Tek Kişilik', 'İki Kişilik'], 0)],
    tags: ['kahvaltı'],
    allergens: ['Süt ürünü'],
  }),
  dish('kahvalti', 66, 'Sahanda Sucuk', 'Tereyağında kızarmış dana sucuk, sahanda sıcak servis.', {
    groups: [single('Yumurta', ['Yumurtasız', 'Bir Yumurtalı', 'İki Yumurtalı'], { required: true, defaultIndex: 0 })],
    tags: ['kahvaltı'],
    allergens: ['Süt ürünü'],
  }),
  dish('kahvalti', 64, 'Gözleme', 'İnce yufka arası peynir, patates ya da ıspanak.', {
    groups: [single('İç Harç', ['Peynirli', 'Patatesli', 'Ispanaklı', 'Kıymalı', 'Karışık'], { required: true, defaultIndex: 0 })],
    extras: ['Kaşar'],
    tags: ['hamur işi'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('kahvalti', 64, 'Simit', 'Pekmeze batırılıp susama bulanmış çıtır sokak simidi.', {
    groups: [adet(['1 Adet', '2 Adet', '5 Adet'], 0)],
    extras: ['Kaşar', 'Krem Peynir'],
    tags: ['fırın'],
    allergens: ['Gluten', 'Susam'],
  }),
  dish('kahvalti', 62, 'Poğaça', 'Yumuşak hamurlu peynirli ya da zeytinli poğaça.', {
    groups: [pogacaAdet(), single('Çeşit', ['Peynirli', 'Zeytinli', 'Patatesli', 'Sade'], { required: true, defaultIndex: 0 })],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('kahvalti', 62, 'Sigara Böreği', 'Beyaz peynirli maydanozlu yufka, çıtır kızartılmış.', {
    groups: [adet(['4 Adet', '6 Adet', '10 Adet'], 1)],
    tags: ['ara sıcak'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('kahvalti', 60, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),
  dish('kahvalti', 58, 'Haşlanmış Yumurta', 'Rafadan ya da tam pişmiş haşlanmış köy yumurtası.', {
    groups: [single('Pişme', ['Rafadan', 'Kayısı Kıvamı', 'Tam Pişmiş'], { required: true, defaultIndex: 1 }), adet(['1 Adet', '2 Adet'], 0)],
    tags: ['yumurta'],
    allergens: ['Yumurta'],
  }),
  dish('kahvalti', 60, 'Avokadolu Ekmek', 'Ekşi maya ekmekte avokado, yumurta ve pul biber.', {
    aliases: ['Avokado Tost'],
    groups: [single('Yumurta', ['Yumurtasız', 'Poşe Yumurta', 'Sahanda Yumurta'], { required: true, defaultIndex: 1 })],
    removable: ['Pul Biber'],
    tags: ['kahvaltı'],
    allergens: ['Gluten', 'Yumurta'],
  }),
  dish('kahvalti', 58, 'Fransız Tostu', 'Yumurtalı sütlü ekmek dilimleri, tereyağında kızartılmış.', {
    groups: [multi('Yanında', ['Bal', 'Pudra Şekeri', 'Çilek', 'Muz', 'Akçaağaç Şurubu'], { maxSelect: 3 })],
    tags: ['tatlı kahvaltı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),
  dish('kahvalti', 56, 'Peynir Tabağı', 'Ezine, kaşar, tulum peyniri, ceviz ve kavun.', {
    groups: [porsiyon(['Tek Kişilik', 'İki Kişilik'], 0)],
    tags: ['kahvaltı'],
    allergens: ['Süt ürünü', 'Sert kabuklu yemiş'],
  }),

  // ---- Burger --------------------------------------------------------------------------------------------------
  dish('burger', 72, 'Acılı Mexican Burger', 'Dana köfte, jalapeno, cheddar ve acılı salsa sos.', {
    aliases: ['Mexican Burger', 'Meksika Burger'],
    groups: [burgerPisme(), burgerMenu(), aciSeviyesi(2), burgerSos()],
    removable: ['Jalapeno Biber', 'Soğan', 'Domates'],
    extras: ['Ekstra Köfte', 'Ekstra Cheddar', 'Bacon'],
    tags: ['burger', 'acılı'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('burger', 70, 'Trüflü Mantarlı Burger', 'Dana köfte, sote mantar, trüf mayonez ve peynir.', {
    groups: [burgerPisme(), burgerMenu(), burgerSos()],
    removable: ['Mantar', 'Trüf Mayonez'],
    extras: ['Ekstra Köfte', 'Ekstra Peynir'],
    tags: ['burger'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('burger', 64, 'Balık Burger', 'Çıtır balık fileto, tartar sos ve marul.', {
    aliases: ['Fish Burger'],
    groups: [burgerMenu(), sosSecimi(['Tartar Sos', 'Mayonez', 'Ketçap'])],
    removable: ['Tartar Sos', 'Marul'],
    tags: ['burger'],
    allergens: ['Balık', 'Gluten', 'Yumurta'],
  }),
  dish('burger', 62, 'Çocuk Burger', 'Küçük dana köfteli burger, cheddar ve ketçapla.', {
    aliases: ['Kids Burger'],
    groups: [single('Menü', ['Sadece Burger', 'Patates ve Meyve Sulu Menü'], { required: true, defaultIndex: 0 })],
    removable: ['Turşu', 'Soğan'],
    tags: ['burger', 'çocuk'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('burger', 68, 'Elma Dilim Patates', 'Kabuklu elma dilim patates, baharatlı ve çıtır.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    removable: ['Baharat'],
    tags: ['yan ürün'],
  }),
  dish('burger', 64, 'Cheddar Soslu Patates', 'Çıtır patates üzerinde sıcak cheddar sos ve jalapeno.', {
    aliases: ['Cheddarlı Patates'],
    groups: [porsiyon(['Orta Porsiyon', 'Büyük Porsiyon'], 0)],
    removable: ['Jalapeno Biber'],
    extras: ['Bacon Parçaları'],
    tags: ['yan ürün'],
    allergens: ['Süt ürünü'],
  }),
  dish('burger', 64, 'Mozzarella Çubukları', 'Çıtır kaplamalı mozzarella, yanında marinara sosu.', {
    groups: [adet(['4 Adet', '6 Adet', '8 Adet'], 1), sosSecimi(['Marinara Sos', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['ara sıcak'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('burger', 62, 'Acılı Tavuk Kanat', 'Fırında acılı soslu tavuk kanatları, ranch sosla.', {
    aliases: ['Buffalo Kanat', 'Hot Wings'],
    groups: [adet(['6 Adet', '9 Adet', '12 Adet'], 0), aciSeviyesi(3)],
    tags: ['ara sıcak', 'acılı'],
  }),
  dish('burger', 58, 'Sezar Salata', 'Marul, ızgara tavuk, kruton, parmesan ve sezar sos.', {
    groups: [salataEkstra()],
    removable: ['Kruton', 'Parmesan'],
    tags: ['salata'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('burger', 58, 'Çikolatalı Brownie', 'Yoğun kakaolu ıslak brownie, cevizli ya da sade.', {
    groups: [single('Çeşit', ['Sade', 'Cevizli', 'Fındıklı'], { required: true, defaultIndex: 0 }), multi('Yanında', ['Dondurma', 'Çikolata Sos'], { mode: 'surcharge' })],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Yumurta', 'Süt ürünü'],
  }),

  // ---- Steak ---------------------------------------------------------------------------------------------------
  dish('steak', 70, 'Kuzu Pirzola', 'Kuzu pirzola kömür ateşinde, közlenmiş sebzeyle.', {
    groups: [porsiyon(['4 Adet', '6 Adet', '8 Adet'], 1), pismeDerecesi(), garnitur()],
    tags: ['ızgara'],
  }),
  dish('steak', 66, 'Tomahawk Steak', 'Kemikli dinlendirilmiş dana antrikot, paylaşmalık büyük kesim.', {
    groups: [gramaj(['800 g', '1 kg', '1,2 kg'], 0), pismeDerecesi(), garnitur()],
    tags: ['steak'],
  }),
  dish('steak', 66, 'Kontrfile', 'Dinlendirilmiş dana kontrfile, tereyağı ve kekikle mühürlenir.', {
    aliases: ['Striploin'],
    groups: [gramaj(['200 g', '300 g', '400 g'], 1), pismeDerecesi(), garnitur(), sosSecimi(['Mantar Sos', 'Biberli Sos', 'Chimichurri'])],
    tags: ['steak'],
  }),
  dish('steak', 64, 'Biftek Burger', 'Kıyılmış dinlendirilmiş et köftesi, cheddar ve karamelize soğan.', {
    groups: [burgerPisme(), burgerMenu(), burgerSos()],
    removable: ['Karamelize Soğan', 'Turşu'],
    extras: ['Ekstra Köfte', 'Ekstra Cheddar'],
    tags: ['burger'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('steak', 60, 'Çoban Salata', 'Domates, salatalık, biber, soğan ve maydanoz.', {
    groups: [salataSos()],
    removable: ['Soğan', 'Biber'],
    tags: ['salata', 'vegan'],
  }),
  dish('steak', 60, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),
  dish('steak', 58, 'Izgara Sebze', 'Kabak, patlıcan, biber ve mantar ızgarada pişirilir.', {
    groups: [single('Sos', ['Zeytinyağı', 'Balzamik', 'Sossuz'], { required: true, defaultIndex: 0 })],
    tags: ['garnitür', 'vegan'],
  }),

  // ---- Tost & Sandviç ------------------------------------------------------------------------------------------
  dish('tost-sandvic', 66, 'Kavurmalı Kaşarlı Tost', 'Dana kavurma ve kaşar peyniri, çıtır tost ekmeğinde.', {
    groups: [ekmekCesidi(), tostEkstra()],
    tags: ['tost'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('tost-sandvic', 64, 'Pastırmalı Kaşarlı Tost', 'Kayseri pastırması ve eriyen kaşar, sıcak tost.', {
    groups: [ekmekCesidi(), tostEkstra()],
    tags: ['tost'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('tost-sandvic', 60, 'Hellimli Tost', 'Hellim peyniri, domates ve fesleğen, tam buğday ekmeğinde.', {
    groups: [ekmekCesidi(), tostEkstra()],
    tags: ['tost', 'vejetaryen'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('tost-sandvic', 60, 'Beyaz Peynirli Tost', 'Ezine peyniri, domates ve kekik, bazlama arasında.', {
    groups: [ekmekCesidi(), tostEkstra()],
    tags: ['tost', 'vejetaryen'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('tost-sandvic', 62, 'Tavuklu Wrap', 'Izgara tavuk, yeşillik ve ranch sos, lavaşa sarılı.', {
    groups: [sosSecimi(['Ranch Sos', 'Barbekü Sos', 'Acı Sos', 'Ballı Hardal']), yanindaGelen(['Patates Kızartması', 'Mevsim Yeşillik'], 1)],
    removable: ['Domates', 'Marul', 'Soğan'],
    tags: ['wrap'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('tost-sandvic', 62, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),
  dish('tost-sandvic', 58, 'Mercimek Çorbası', 'Kırmızı mercimekten süzme çorba, limon ve krutonla.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
  }),
  dish('tost-sandvic', 58, 'Köfte Ekmek', 'Izgara köfte, közlenmiş biber ve domates, ekmek arası.', {
    groups: [ekmekCesidi(), sosSecimi(['Ketçap', 'Mayonez', 'Acı Sos'])],
    removable: ['Soğan', 'Domates', 'Biber'],
    tags: ['sandviç'],
    allergens: ['Gluten'],
  }),

  // ---- Börek ---------------------------------------------------------------------------------------------------
  dish('borek', 64, 'Gül Böreği', 'Yufkadan rulo gül böreği, peynirli ya da kıymalı.', {
    groups: [adet(['1 Adet', '3 Adet', '6 Adet'], 0), single('İç Harç', ['Peynirli', 'Kıymalı', 'Patatesli', 'Ispanaklı'], { required: true, defaultIndex: 0 })],
    tags: ['börek'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('borek', 60, 'Pırasalı Börek', 'Zeytinyağlı pırasa harçlı tepsi böreği, kare dilim.', {
    groups: [gramaj(['200 g', '500 g', '1 kg'], 0)],
    tags: ['börek'],
    allergens: ['Gluten'],
  }),
  dish('borek', 60, 'Kaşarlı Börek', 'Bol kaşarlı tepsi böreği, çıtır kenarlı ve sıcak.', {
    groups: [gramaj(['200 g', '500 g', '1 kg'], 0)],
    tags: ['börek'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('borek', 58, 'Sütlü Börek', 'Sütlü yumurtalı yufka katları, fırında pudra şekerli.', {
    aliases: ['Şekerli Börek'],
    groups: [gramaj(['200 g', '500 g', '1 kg'], 0)],
    tags: ['börek', 'tatlı'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('borek', 58, 'Türk Kahvesi', 'Közde pişen köpüklü Türk kahvesi, lokumla birlikte.', {
    groups: [sekerOrani(), single('Fincan', ['Tek', 'Duble'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['sıcak içecek'],
  }),
  dish('borek', 56, 'Simit', 'Pekmeze batırılıp susama bulanmış çıtır sokak simidi.', {
    groups: [adet(['1 Adet', '2 Adet', '5 Adet'], 0)],
    extras: ['Kaşar', 'Krem Peynir'],
    tags: ['fırın'],
    allergens: ['Gluten', 'Susam'],
  }),

  // ---- Çiğ Köfte -----------------------------------------------------------------------------------------------
  dish('cigkofte', 60, 'Turşu Tabağı', 'Karışık ev turşusu, salatalık, biber ve lahana.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Büyük Porsiyon'], 0)],
    tags: ['yan ürün'],
  }),
  dish('cigkofte', 58, 'Acılı Ezme', 'Domates, biber ve soğanla hazırlanan acılı ezme.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Büyük Porsiyon'], 0)],
    tags: ['meze', 'acılı'],
  }),
  dish('cigkofte', 58, 'Künefe', 'Tel kadayıf arası peynir, şerbet ve fıstıkla sıcak.', {
    groups: [tatliPorsiyon(), tatliYani()],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('cigkofte', 56, 'Fırın Sütlaç', 'Fırında üstü kızarmış sütlaç, tarçınla servis.', {
    groups: [single('Üzeri', ['Sade', 'Tarçınlı', 'Fındıklı'], { required: true, defaultIndex: 1 })],
    tags: ['tatlı'],
    allergens: ['Süt ürünü'],
  }),
  dish('cigkofte', 56, 'Mercimek Köftesi', 'Kırmızı mercimek ve bulgurdan yeşillikli köfte, marulla.', {
    groups: [adet(['6 Adet', '10 Adet', '16 Adet'], 1)],
    tags: ['vegan'],
    allergens: ['Gluten'],
  }),

  // ---- Ev Yemekleri --------------------------------------------------------------------------------------------
  dish('ev-yemekleri', 64, 'İmam Bayıldı', 'Zeytinyağlı patlıcan, soğan, domates ve sarımsakla.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1)],
    tags: ['zeytinyağlı', 'vegan'],
  }),
  dish('ev-yemekleri', 64, 'Biber Dolması', 'Kıymalı pirinç harcıyla doldurulmuş biber, yoğurtla.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), single('Yoğurt', ['Yoğurtlu', 'Yoğurtsuz'], { required: true, defaultIndex: 0 })],
    tags: ['tencere'],
    allergens: ['Süt ürünü'],
  }),
  dish('ev-yemekleri', 60, 'Fırın Makarna', 'Beşamel soslu kaşarlı fırın makarna, kare dilim.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1)],
    tags: ['fırın'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),
  dish('ev-yemekleri', 62, 'Patates Oturtma', 'Kıymalı domates sosunda fırın patates, ev usulü.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), pilavSecimi()],
    tags: ['fırın'],
  }),
  dish('ev-yemekleri', 60, 'Ezogelin Çorbası', 'Mercimek, bulgur ve nane ile ev usulü çorba.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
    allergens: ['Gluten'],
  }),
  dish('ev-yemekleri', 58, 'Etli Bamya', 'Kuşbaşı etle domatesli bamya yemeği, limonlu.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), pilavSecimi()],
    tags: ['tencere'],
  }),

  // ---- Salata & Sağlık -----------------------------------------------------------------------------------------
  dish('salata-saglikli', 64, 'Avokadolu Salata', 'Avokado, kinoa, cherry domates ve limonlu sos.', {
    groups: [salataSos(), salataEkstra()],
    removable: ['Soğan', 'Kinoa'],
    tags: ['salata', 'vegan'],
  }),
  dish('salata-saglikli', 62, 'Izgara Tavuklu Salata', 'Izgara tavuk göğsü, yeşillik, mısır ve havuç.', {
    groups: [salataSos(), salataEkstra()],
    removable: ['Mısır', 'Soğan'],
    tags: ['salata', 'protein'],
  }),
  dish('salata-saglikli', 60, 'Mercimekli Salata', 'Yeşil mercimek, kırmızı biber, maydanoz ve nar ekşisi.', {
    groups: [salataSos()],
    removable: ['Soğan'],
    tags: ['salata', 'vegan'],
  }),
  dish('salata-saglikli', 60, 'Kısır', 'İnce bulgur, nar ekşisi, salça ve taze yeşillik.', {
    groups: [mezeBoy()],
    removable: ['Soğan', 'Maydanoz'],
    tags: ['vegan'],
    allergens: ['Gluten'],
  }),
  dish('salata-saglikli', 58, 'Smoothie Bowl', 'Muz ve orman meyveli smoothie, granola ve chia.', {
    groups: [multi('Üzeri', ['Granola', 'Chia', 'Muz', 'Çilek', 'Hindistan Cevizi', 'Fıstık Ezmesi'], { maxSelect: 4 })],
    tags: ['kahvaltı', 'vegan'],
    allergens: ['Gluten', 'Sert kabuklu yemiş'],
  }),
  dish('salata-saglikli', 56, 'Detoks Yeşil Smoothie', 'Ispanak, elma, salatalık, zencefil ve limon.', {
    groups: [boy(['Orta', 'Büyük'], 0)],
    tags: ['içecek', 'vegan'],
  }),

  // ---- Tatlı ---------------------------------------------------------------------------------------------------
  dish('tatli', 66, 'Cevizli Baklava', 'İnce yufka katları, bol ceviz ve şerbet.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0), tatliYani()],
    tags: ['şerbetli'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('tatli', 62, 'Burma Kadayıf', 'Fıstıklı burma kadayıf dilimleri, hafif şerbetli.', {
    groups: [gramaj(['250 g', '500 g', '1 kg'], 0), tatliYani()],
    tags: ['şerbetli'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('tatli', 58, 'Kabak Tatlısı', 'Şekerde pişen bal kabağı, tahin ve ceviz ile.', {
    groups: [tatliPorsiyon(), single('Üzeri', ['Tahin ve Ceviz', 'Kaymak', 'Sade'], { required: true, defaultIndex: 0 })],
    tags: ['mevsim'],
    allergens: ['Susam', 'Sert kabuklu yemiş'],
  }),
  dish('tatli', 58, 'Keşkül', 'Bademli sütlü tatlı, üzeri hindistan cevizi ve fıstık.', {
    tags: ['sütlü'],
    allergens: ['Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('tatli', 56, 'Aşure', 'Buğday, nohut, kuru meyve ve cevizle hazırlanan aşure.', {
    tags: ['geleneksel'],
    allergens: ['Gluten', 'Sert kabuklu yemiş'],
  }),
  dish('tatli', 58, 'Muhallebi', 'Pirinç unlu sütlü tatlı, tarçın ya da fıstıkla.', {
    groups: [single('Üzeri', ['Tarçınlı', 'Fıstıklı', 'Hindistan Cevizli'], { required: true, defaultIndex: 0 })],
    tags: ['sütlü'],
    allergens: ['Süt ürünü'],
  }),
  dish('tatli', 60, 'Türk Kahvesi', 'Közde pişen köpüklü Türk kahvesi, lokumla birlikte.', {
    groups: [sekerOrani(), single('Fincan', ['Tek', 'Duble'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['sıcak içecek'],
  }),
  dish('tatli', 58, 'Çay', 'Demlikte demlenen taze siyah çay, ince belli bardakta.', {
    groups: [single('Bardak', ['Küçük Bardak', 'Büyük Bardak', 'Fincan'], { required: true, mode: 'sets_base', defaultIndex: 0 })],
    tags: ['sıcak içecek'],
  }),

  // ---- Sokak Lezzetleri ----------------------------------------------------------------------------------------
  dish('sokak-lezzetleri', 64, 'Balık Ekmek', 'Izgara uskumru, soğan ve marul, yarım ekmek arası.', {
    groups: [single('Ekmek', ['Yarım Ekmek', 'Dürüm'], { required: true, defaultIndex: 0 })],
    removable: ['Soğan', 'Marul'],
    extras: ['Ekstra Limon', 'Turşu'],
    tags: ['balık'],
    allergens: ['Balık', 'Gluten'],
  }),
  dish('sokak-lezzetleri', 60, 'Sosisli Sandviç', 'Izgara sosis, ketçap, mayonez ve turşu, sandviç ekmeğinde.', {
    groups: [sosSecimi(['Ketçap', 'Mayonez', 'Hardal', 'Acı Sos'])],
    removable: ['Turşu'],
    extras: ['Kaşar', 'Patates'],
    tags: ['sandviç'],
    allergens: ['Gluten', 'Yumurta'],
  }),
  dish('sokak-lezzetleri', 62, 'Kokoreç Dürüm', 'Közde kokoreç, kekik ve pul biberle lavaşta.', {
    groups: [porsiyon(['Yarım', 'Tam'], 1), aciSeviyesi(2)],
    removable: ['Domates', 'Biber'],
    tags: ['kokoreç'],
    allergens: ['Gluten'],
  }),
  dish('sokak-lezzetleri', 60, 'Çiğ Köfte Dürüm', 'Etsiz çiğ köfte, marul ve nar ekşisiyle lavaşta.', {
    groups: [aciSeviyesi(2), durumMenu()],
    removable: ['Marul', 'Nane', 'Nar Ekşisi'],
    tags: ['vegan'],
    allergens: ['Gluten'],
  }),
  dish('sokak-lezzetleri', 56, 'Pamuk Helva', 'Taze sarılmış pembe ve beyaz pamuk şeker.', {
    aliases: ['Pamuk Şeker'],
    groups: [adet(['1 Çubuk', '2 Çubuk'], 0)],
    tags: ['tatlı'],
  }),

  // ---- Döner ---------------------------------------------------------------------------------------------------
  dish('doner', 66, 'Kaşarlı Et Döner Dürüm', 'Yaprak et döner ve eriyen kaşar, lavaşa sarılı.', {
    groups: [porsiyon(['Normal', 'Büyük Boy'], 0), durumMenu()],
    removable: ['Soğan', 'Domates', 'Turşu'],
    extras: ['Ekstra Kaşar', 'Ekstra Et'],
    tags: ['dürüm'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('doner', 58, 'Mercimek Çorbası', 'Kırmızı mercimekten süzme çorba, limon ve krutonla.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
  }),
  dish('doner', 58, 'Çoban Salata', 'Domates, salatalık, biber, soğan ve maydanoz.', {
    groups: [salataSos()],
    removable: ['Soğan', 'Biber'],
    tags: ['salata', 'vegan'],
  }),

  // ---- Tavuk ---------------------------------------------------------------------------------------------------
  dish('tavuk', 66, 'Acılı Tavuk Kanat', 'Fırında acılı soslu tavuk kanatları, ranch sosla.', {
    aliases: ['Buffalo Kanat', 'Hot Wings'],
    groups: [adet(['6 Adet', '9 Adet', '12 Adet'], 0), aciSeviyesi(3)],
    tags: ['ara sıcak', 'acılı'],
  }),
  dish('tavuk', 66, 'Tavuk Burger', 'Çıtır tavuk göğsü, marul, turşu ve mayonez.', {
    groups: [burgerMenu(), tavukSos()],
    removable: ['Turşu', 'Marul', 'Mayonez'],
    extras: ['Cheddar', 'Ekstra Tavuk'],
    tags: ['burger'],
    allergens: ['Gluten', 'Yumurta'],
  }),
  dish('tavuk', 62, 'Soğan Halkası', 'Çıtır kaplamalı soğan halkaları, barbekü sosla.', {
    groups: [adet(['6 Adet', '10 Adet', '16 Adet'], 1), tavukSos()],
    tags: ['yan ürün'],
    allergens: ['Gluten'],
  }),
  dish('tavuk', 62, 'Elma Dilim Patates', 'Kabuklu elma dilim patates, baharatlı ve çıtır.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    removable: ['Baharat'],
    tags: ['yan ürün'],
  }),
  dish('tavuk', 58, 'Sezar Salata', 'Marul, ızgara tavuk, kruton, parmesan ve sezar sos.', {
    groups: [salataEkstra()],
    removable: ['Kruton', 'Parmesan'],
    tags: ['salata'],
    allergens: ['Gluten', 'Süt ürünü', 'Yumurta'],
  }),

  // ---- Pide & Lahmacun -----------------------------------------------------------------------------------------
  dish('pide-lahmacun', 62, 'Kuşbaşılı Kaşarlı Pide', 'Kuşbaşı et, eriyen kaşar ve biber, taş fırında.', {
    groups: [porsiyon(['Yarım', 'Tam'], 1), multi('Ekstra Malzeme', ['Kaşar', 'Yumurta', 'Tereyağı', 'Sucuk'], { mode: 'surcharge' })],
    removable: ['Biber', 'Domates'],
    tags: ['pide'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pide-lahmacun', 60, 'Sucuklu Kaşarlı Pide', 'Dana sucuk ve kaşar peyniri, tereyağlı taş fırın.', {
    groups: [porsiyon(['Yarım', 'Tam'], 1), multi('Ekstra Malzeme', ['Kaşar', 'Yumurta', 'Tereyağı', 'Sucuk'], { mode: 'surcharge' })],
    tags: ['pide'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pide-lahmacun', 58, 'Bafra Pidesi', 'İnce uzun Bafra usulü kıymalı pide, tereyağlı.', {
    groups: [porsiyon(['Yarım', 'Tam'], 1)],
    tags: ['pide'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),
  dish('pide-lahmacun', 58, 'Kaşarlı Mantarlı Pide', 'Sote mantar ve bol kaşarla taş fırın pide.', {
    groups: [porsiyon(['Yarım', 'Tam'], 1), multi('Ekstra Malzeme', ['Kaşar', 'Yumurta', 'Tereyağı', 'Sucuk'], { mode: 'surcharge' })],
    tags: ['pide', 'vejetaryen'],
    allergens: ['Gluten', 'Süt ürünü'],
  }),

  // ---- Köfte ---------------------------------------------------------------------------------------------------
  dish('kofte', 64, 'Izgara Köfte', 'Dana kıymadan ızgara köfte, piyaz ve pilavla.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon', '1,5 Porsiyon'], 1), pilavSecimi()],
    tags: ['ızgara'],
    allergens: ['Gluten'],
  }),
  dish('kofte', 60, 'Cızbız Köfte', 'İnce yassı ızgara köfteler, közlenmiş domates ve biberle.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), yanindaGelen(['Piyaz', 'Pilav', 'Patates Kızartması', 'Közlenmiş Biber'], 2)],
    tags: ['ızgara'],
    allergens: ['Gluten'],
  }),
  dish('kofte', 58, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),
  dish('kofte', 58, 'Çoban Salata', 'Domates, salatalık, biber, soğan ve maydanoz.', {
    groups: [salataSos()],
    removable: ['Soğan', 'Biber'],
    tags: ['salata', 'vegan'],
  }),

  // ---- Tantuni -------------------------------------------------------------------------------------------------
  dish('tantuni', 58, 'Mercimek Çorbası', 'Kırmızı mercimekten süzme çorba, limon ve krutonla.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
  }),
  dish('tantuni', 58, 'Künefe', 'Tel kadayıf arası peynir, şerbet ve fıstıkla sıcak.', {
    groups: [tatliPorsiyon(), tatliYani()],
    tags: ['tatlı'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('tantuni', 56, 'Patates Kızartması', 'Altın renginde çıtır patates, tuz ve baharatla.', {
    groups: [porsiyon(['Küçük Porsiyon', 'Orta Porsiyon', 'Büyük Porsiyon'], 1), sosSecimi(['Ketçap', 'Mayonez', 'Ranch Sos', 'Barbekü Sos'])],
    tags: ['yan ürün'],
  }),

  // ---- Kebap ---------------------------------------------------------------------------------------------------
  dish('kebap-izgara', 58, 'Testi Kebabı', 'Testide pişen kuzu eti ve sebzeler, masada kırılır.', {
    groups: [porsiyon(['Tek Kişilik', 'İki Kişilik'], 0), pilavSecimi()],
    tags: ['özel'],
  }),

  // ---- Çorba ---------------------------------------------------------------------------------------------------
  dish('corba', 58, 'Brokoli Çorbası', 'Kremalı brokoli çorbası, kruton ve tereyağı ile.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    removable: ['Kruton'],
    tags: ['çorba'],
    allergens: ['Süt ürünü', 'Gluten'],
  }),
  dish('corba', 58, 'Kremalı Tavuk Çorbası', 'Didiklenmiş tavuk, sebze ve krema ile terbiyeli çorba.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba'],
    allergens: ['Süt ürünü'],
  }),
  dish('corba', 56, 'Kırmızı Mercimekli Sebze Çorbası', 'Mercimek, havuç ve patatesle hazırlanan doyurucu çorba.', {
    groups: [porsiyon(['Kase', 'Büyük Kase'], 0)],
    tags: ['çorba', 'vegan'],
  }),

  // ---- Mantı & Makarna -----------------------------------------------------------------------------------------
  dish('manti-hamur-isleri', 60, 'Sinop Mantısı', 'Cevizli yoğurtlu, iri kesimli Sinop usulü mantı.', {
    groups: [porsiyon(['Yarım Porsiyon', '1 Porsiyon'], 1), multi('Üzeri', ['Ceviz', 'Pul Biber', 'Tereyağı', 'Nane'], { maxSelect: 4 })],
    tags: ['mantı'],
    allergens: ['Gluten', 'Süt ürünü', 'Sert kabuklu yemiş'],
  }),
  dish('manti-hamur-isleri', 58, 'Kıymalı Gözleme', 'İnce yufka arası soğanlı kıyma, sacda pişirilir.', {
    groups: [multi('Ekstra Malzeme', ['Kaşar', 'Tereyağı', 'Yeşillik'], { mode: 'surcharge' })],
    tags: ['hamur işi'],
    allergens: ['Gluten'],
  }),
  dish('manti-hamur-isleri', 58, 'Patatesli Gözleme', 'İnce yufka arası baharatlı patates, sacda pişirilir.', {
    groups: [multi('Ekstra Malzeme', ['Kaşar', 'Tereyağı', 'Yeşillik'], { mode: 'surcharge' })],
    tags: ['hamur işi', 'vejetaryen'],
    allergens: ['Gluten'],
  }),
];

// ---- packaged drinks: every store opens with at least ten (D-206) ---------------------------------------------

const PACKAGED: readonly (readonly [name: string, importance: number, aliases: readonly string[], portion: string])[] = [
  ['Kola', 62, ['Coca Cola', 'Pepsi', 'Coca-Cola'], '330 ml'],
  ['Kola Zero', 54, ['Coca Cola Zero', 'Şekersiz Kola', 'Pepsi Max'], '330 ml'],
  ['Gazoz', 52, ['Sprite', 'Limonlu Gazoz', '7Up'], '330 ml'],
  ['Portakallı Gazoz', 50, ['Fanta', 'Portakal Aromalı Gazoz'], '330 ml'],
  ['Ice Tea Şeftali', 50, ['Şeftalili Soğuk Çay', 'Soğuk Çay Şeftali'], '330 ml'],
  ['Ice Tea Limon', 48, ['Limonlu Soğuk Çay', 'Soğuk Çay Limon'], '330 ml'],
  ['Maden Suyu', 48, [], '200 ml'],
  ['Meyveli Maden Suyu', 44, [], '200 ml'],
  ['Su', 56, ['Pet Su', 'Şişe Su'], '500 ml'],
  ['Meyve Suyu', 46, ['Kutu Meyve Suyu'], '200 ml'],
  ['Ayran', 58, [], '300 ml'],
];

/** Kitchens whose menus carry şalgam next to ayran. */
const SALGAM: ReadonlySet<CuisineSlug> = new Set([
  'kebap-izgara',
  'doner',
  'pide-lahmacun',
  'kofte',
  'cigkofte',
  'tantuni',
  'ev-yemekleri',
  'sokak-lezzetleri',
  'balik-deniz',
  'meze',
  'steak',
]);

/**
 * The standard drink set for every cuisine, minus what that cuisine (in the earlier waves or above) already has.
 * `existing` is the rest of the pool, so a drink is never seeded twice in one kitchen.
 */
export function packagedDrinks(existing: readonly SeedTemplate[]): SeedTemplate[] {
  const have = new Set(existing.map((t) => `${t.cuisine}|${normalizeTr(t.payload.name)}`));
  return CUISINE_SLUGS.flatMap((cuisine) => {
    const set = SALGAM.has(cuisine) ? [...PACKAGED, ['Şalgam Suyu', 50, [], '300 ml'] as const] : PACKAGED;
    return set
      .filter(([name]) => !have.has(`${cuisine}|${normalizeTr(name)}`))
      .map(([name, importance, aliases, portion]) => drink(cuisine, name, importance, aliases, portion));
  });
}

export const ZENGIN_TEMPLATES: readonly SeedTemplate[] = DISHES;
