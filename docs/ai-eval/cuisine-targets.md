# Mutfak türüne göre gerçekçi ürün sayısı ve açılış hedefi

AŞAMA 2 çıktısı. Şube açılışı için kural **en az 10 ürün** (`MIN_BRANCH_ITEMS`, değişmedi). Bunun üstüne her mutfak türü
için gerçek bir paket servis menüsünün taşıdığı ürün sayısına dayanan bir **açılış hedefi** eklendi. "Tam" mod menüyü bu
hedefe tamamlamaya çalışır; ekrandaki "hedef" sayısı da budur.

## Tablo

| Mutfak türü | Gerçekçi ortalama | Önerilen minimum hedef | Kısa gerekçe |
|---|---:|---:|---|
| Kebap & Izgara | 35 | 20 | Kebap, dürüm ve porsiyon çeşitleri (10–15) + çorba, ara sıcak, salata/meze, tatlı, içecek; büyük kebapçılar 60–90. |
| Döner | 22 | 14 | Et/tavuk × dürüm, ekmek arası, porsiyon, pilav üstü; menüler, yan ürün, içecek. |
| Pide & Lahmacun | 28 | 18 | 8–12 pide, lahmacun çeşitleri, çorba, salata, tatlı ve içecek. |
| Köfte | 22 | 14 | Köfte porsiyon/ekmek/dürüm çeşitleri, piyaz, çorba, tatlı, içecek. |
| Çiğ Köfte | 20 | 12 | Dürüm, porsiyon (gramaj), kase/tako, menüler, içecek, tatlı; zincirler varyantlarla 150+ ürüne çıkar. |
| Ev Yemekleri | 32 | 20 | Günlük tencere yemekleri, çorba, pilav, zeytinyağlı, tatlı, içecek. |
| Çorba | 14 | 10 | 8–10 çorba çeşidi, yanında ekmek ve içecek. |
| Mantı & Hamur İşleri | 18 | 12 | Mantı çeşitleri, gözleme/börek, çorba, içecek. |
| Tatlı & Künefe | 32 | 20 | Şerbetli, sütlü, dondurmalı tatlılar, pasta dilimleri, kahve ve çay. |
| Dondurma | 18 | 12 | Top/külah/kase/kilo, dondurmalı tatlılar, soğuk içecekler. |
| Sokak Lezzetleri | 16 | 10 | Dar uzmanlık (kokoreç, midye, kumpir) + boy varyantları ve içecek. |
| Tantuni | 14 | 10 | Et/tavuk × dürüm, ekmek arası, tabak; yan ürün, içecek. |
| Burger | 24 | 14 | 6–10 burger, menü versiyonları, 4–6 yan ürün, içecek, tatlı. |
| Tavuk | 26 | 16 | Parça, kanat, bonfile, nugget, burger/wrap, kova menüler, yan ürün, sos, içecek. |
| Pizza | 28 | 18 | 10–14 pizza, yan ürün, kampanya menüleri, içecek, tatlı. |
| Makarna & İtalyan | 20 | 14 | 8–12 makarna/risotto, salata, başlangıç, tatlı, içecek. |
| Steak & Et | 22 | 14 | 6–10 et kesimi, garnitür, başlangıç, salata, tatlı, içecek. |
| Kahvaltı | 36 | 20 | Serpme/tabaklar, yumurtalılar, fırından, tatlı kahvaltı, içecekler (rehberler: 35–45). |
| Tost & Sandviç | 20 | 12 | Tost ve sandviç çeşitleri, yan ürün, çay/ayran. |
| Pastane & Fırın | 40 | 24 | Poğaça/simit/açma, börek, pasta, kuru pasta, şerbetli, içecek (rehberler: 45–55). |
| Börek | 18 | 12 | Börek çeşitleri (tepsi/kol/su), porsiyon ve kilo, çay, ayran, tatlı. |
| Kafe & İçecek | 42 | 25 | Sıcak/soğuk kahveler, çaylar, soğuk içecekler, tatlı, atıştırmalık (rehber: küçük kafe 30–45, orta 50–70). |
| Balık & Deniz Ürünleri | 24 | 15 | Mevsim balıkları, deniz ürünleri, meze/salata, ara sıcak, içecek. |
| Meze | 28 | 18 | Soğuk meze çeşitleri (15–20), ara sıcak, salata, içecek. |
| Salata & Sağlıklı | 18 | 12 | Salata/bowl çeşitleri, wrap, smoothie ve taze sıkma. |
| Uzak Doğu & Sushi | 32 | 20 | Sushi roll çeşitleri, wok/noodle, çorba, başlangıç, içecek. |
| Dünya Mutfağı | 24 | 15 | Tacos/burrito/quesadilla vb. varyantlar, başlangıç, tatlı, içecek. |

## Yöntem

1. **Kategori yapısından hesap.** Her mutfak türü için gerçek bir paket menünün hangi bölümleri olduğu ve bölüm başına kaç
   ürün taşıdığı yazıldı (ör. kebapçı: 10–15 kebap/dürüm/porsiyon + 3–4 çorba + 3–5 ara sıcak/meze + 3–4 tatlı + 6–8 içecek).
2. **Menü mühendisliği sınırı.** Kategori başına 5–9 ürün; bunun üstü seçim yorgunluğu yaratıyor. Bir kategoriye bu
   aralığın üstünde ürün yazılmadı.
3. **Gerçek menülerle karşılaştırma.** Aşağıdaki yayımlanmış menüler sayıldı; ortalama tipik bir mahalle işletmesini
   hedefliyor, zincir ve büyük restoranlar üst uçta kalıyor.
4. **Hedef = ortalama − uzun kuyruk.** Hedef, şubenin ilk gün gerçekten ihtiyaç duyduğu ürünler: ortalamanın yaklaşık
   %55–65'i, hiçbir zaman 10'un altında değil.

### Karşılaştırılan menüler

| Menü | Tür | Sayılan ürün |
|---|---|---|
| Kervansaray Yenibosna paket menüsü | kebap / ev yemeği restoranı | 91 (11 çorba, 36 ana yemek, 16 salata-aperatif, 10 tatlı, 18 içecek); içecek ve tatlı hariç 63 |
| Kırçiçeği | pide, çorba, kebap | 35 (8 çorba, 8 pide, 8 kebap-ızgara, 6 salata-yan, 5 tatlı; içecekler listede yok) |
| White Burger | burger | ~23–25 (3 burger × 3 boy, 8 yan ürün-ekstra, 9 içecek, 3 menü) |
| Komagene | çiğ köfte zinciri | 162 (dürümlü menüler 21, dürüm 16, tako 9, çiğ köfte 7, şuşi 6… + 39 atıştırmalık, 24 içecek) |
| Memoş Tantuni | tantuni | et/tavuk × dürüm, somun, yoğurtlu + kerebiç, kara lahana: ~12–15 |
| Kafe menü rehberi | kafe | küçük/butik kafe 30–45, orta ölçekli 50–70, kahvaltı ağırlıklı 60–90; kategori başına 6–12 |

## Nerede tutuluyor

Sayılar kodda sabit değil, veritabanında:

- `cuisines.min_item_count` = açılış hedefi; `cuisines.typical_item_count` = gerçekçi ortalama;
  `cuisines.target_note` = gerekçe (migration `0004_product_types`).
- Tohum değerleri `backend/src/db/seed/cuisine-targets.ts` dosyasından gelir ve her kurulumda uygulanır.
- Uygulamada **Ayarlar → Mutfak türleri** ekranından hedef değiştirilebilir. Elle değiştirilen hedef
  `min_item_count_edited_by_user = true` olarak işaretlenir ve tohum onu bir daha değiştirmez. Migration, bugün 10'dan
  farklı olan her hedefi (ör. kafenin elle girilmiş 50'si) kullanıcının kabul eder ve korur.
- 10 ürünlük kesin kural ayrı kalır: hedef ne olursa olsun ekranda `max(10, hedef)` gösterilir.

## Kaynaklar

- [Kervansaray Yenibosna — Paket Fiyat Menü](https://kervansarayyenibosna.com/paket-qr-menu/paket-fiyat-menu/)
- [Kırçiçeği Menü Fiyatları 2026](https://menufiyati.tr/kircicegi-menu-fiyatlari/)
- [White Burger Menü Fiyatları 2026 — Karekod Blog](https://www.karekod.org/blog/white-burger-menu-fiyatlari/)
- [Komagene Menü Fiyatları 2026 — Menü Fiyatlar](https://menufiyatlar.com/881-komagene-menu-fiyatlari)
- [Memoş Tantuni Menü Fiyatları 2026 — Menü Fiyatlar](https://menufiyatlar.com/2231-memos-tantuni-menu-fiyatlari)
- [Kafe Menüsü Örnekleri — Menüde Neler Olmalı ve Kategoriler (kafe360)](https://kafe360.com/blog/kafe-menusu-ornekleri-neler-olmali)
- [How Many Items Should Be on a Restaurant Menu? (qamarero)](https://qamarero.com/en/blog/how-many-items-should-be-on-a-restaurant-menu-full-guide/)
- [Menu Engineering Matrix (Toast)](https://pos.toasttab.com/blog/on-the-line/menu-engineering-matrix)
- [Restaurant Menu Design, Layout & Size (TouchBistro)](https://www.touchbistro.com/blog/restaurant-menu-design/)
