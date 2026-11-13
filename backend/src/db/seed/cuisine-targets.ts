import type { CuisineSlug } from './cuisines.js';

/**
 * Realistic product counts per cuisine and the opening target derived from them (D-177, docs/ai-eval/
 * cuisine-targets.md for the research).
 *
 *   typical  what a complete Turkish delivery menu of this kind usually carries
 *   target   the opening minimum the analysis fills up to in "tam" mode — never below 10 (the business rule)
 *
 * Method: the category structure a delivery menu of the cuisine really has (which sections, how many products per
 * section), cross-checked against published menus (a kebab house with 51 products, another with 33+ before drinks
 * and desserts; café guides putting a café at 40–50, a breakfast place at 35–45, a patisserie at 45–55) and the
 * 5–8-products-per-category guidance of menu-engineering studies. The target is roughly the typical count minus
 * the long tail — the products a branch really needs on day one.
 *
 * These are SEED values: they land in `cuisines` and are applied only where the user has not set a target by hand
 * (`min_item_count_edited_by_user`). Editing a target in the app makes it the user's for good.
 */
export interface CuisineTarget {
  typical: number;
  target: number;
  note: string;
}

export const CUISINE_TARGETS: Readonly<Record<CuisineSlug, CuisineTarget>> = {
  'kebap-izgara': { typical: 35, target: 20, note: 'Kebap, dürüm ve porsiyon çeşitleri (10–15) + çorba, ara sıcak, salata/meze, tatlı, içecek; büyük kebapçılar 60–90.' },
  doner: { typical: 22, target: 14, note: 'Et/tavuk × dürüm, ekmek arası, porsiyon, pilav üstü; menüler, yan ürün, içecek.' },
  'pide-lahmacun': { typical: 28, target: 18, note: '8–12 pide, lahmacun çeşitleri, çorba, salata, tatlı ve içecek.' },
  kofte: { typical: 22, target: 14, note: 'Köfte porsiyon/ekmek/dürüm çeşitleri, piyaz, çorba, tatlı, içecek.' },
  cigkofte: { typical: 20, target: 12, note: 'Dürüm, porsiyon (gramaj), kase/tako, menüler, içecek, tatlı; zincirler varyantlarla 150+ ürüne çıkar.' },
  'ev-yemekleri': { typical: 32, target: 20, note: 'Günlük tencere yemekleri, çorba, pilav, zeytinyağlı, tatlı, içecek.' },
  corba: { typical: 14, target: 10, note: '8–10 çorba çeşidi, yanında ekmek ve içecek.' },
  'manti-hamur-isleri': { typical: 18, target: 12, note: 'Mantı çeşitleri, gözleme/börek, çorba, içecek.' },
  tatli: { typical: 32, target: 20, note: 'Şerbetli, sütlü, dondurmalı tatlılar, pasta dilimleri, kahve ve çay.' },
  dondurma: { typical: 18, target: 12, note: 'Top/külah/kase/kilo, dondurmalı tatlılar, soğuk içecekler.' },
  'sokak-lezzetleri': { typical: 16, target: 10, note: 'Dar uzmanlık (kokoreç, midye, kumpir) + boy varyantları ve içecek.' },
  tantuni: { typical: 14, target: 10, note: 'Et/tavuk × dürüm, ekmek arası, tabak; yan ürün, içecek.' },
  burger: { typical: 24, target: 14, note: '6–10 burger, menü versiyonları, 4–6 yan ürün, içecek, tatlı.' },
  tavuk: { typical: 26, target: 16, note: 'Parça, kanat, bonfile, nugget, burger/wrap, kova menüler, yan ürün, sos, içecek.' },
  pizza: { typical: 28, target: 18, note: '10–14 pizza, yan ürün, kampanya menüleri, içecek, tatlı.' },
  steak: { typical: 22, target: 14, note: '6–10 et kesimi, garnitür, başlangıç, salata, tatlı, içecek.' },
  kahvalti: { typical: 36, target: 20, note: 'Serpme/tabaklar, yumurtalılar, fırından, tatlı kahvaltı, içecekler (rehberler: 35–45).' },
  'tost-sandvic': { typical: 20, target: 12, note: 'Tost ve sandviç çeşitleri, yan ürün, çay/ayran.' },
  'pastane-firin': { typical: 40, target: 24, note: 'Poğaça/simit/açma, börek, pasta, kuru pasta, şerbetli, içecek (rehberler: 45–55).' },
  borek: { typical: 18, target: 12, note: 'Börek çeşitleri (tepsi/kol/su), porsiyon ve kilo, çay, ayran, tatlı.' },
  'kafe-icecek': { typical: 42, target: 25, note: 'Sıcak/soğuk kahveler, çaylar, soğuk içecekler, tatlı, atıştırmalık (rehber: küçük kafe 30–45, orta 50–70).' },
  'balik-deniz': { typical: 24, target: 15, note: 'Mevsim balıkları, deniz ürünleri, meze/salata, ara sıcak, içecek.' },
  meze: { typical: 28, target: 18, note: 'Soğuk meze çeşitleri (15–20), ara sıcak, salata, içecek.' },
  'salata-saglikli': { typical: 18, target: 12, note: 'Salata/bowl çeşitleri, wrap, smoothie ve taze sıkma.' },
  'uzak-dogu': { typical: 32, target: 20, note: 'Sushi roll çeşitleri, wok/noodle, çorba, başlangıç, içecek.' },
  'dunya-mutfagi': { typical: 24, target: 15, note: 'Tacos/burrito/quesadilla vb. varyantlar, başlangıç, tatlı, içecek.' },
};
