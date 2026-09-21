# Menü girdisi fixture'ları

Öncesi/sonrası karşılaştırması **aynı girdiyle** yapılabilsin diye buradalar. Her dosya bir şubenin
satıcıdan gelen eksik menüsünü temsil eder (canlı telefon görüşmesi senaryosu).

| Alan | Anlamı |
|---|---|
| `id` | Dosya adı = fixture kimliği, raporlarda bu isimle geçer |
| `cuisineSlug` | `src/db/seed/cuisines.ts` içindeki slug |
| `label` | Rapor tablolarında görünen ad |
| `menu` | Satıcıdan gelen ürünler — pipeline girdisi (isim listesi, fiyat yok) |
| `expectCategories` | Bu mutfakta beklenen kategoriler — Gap Analyst'in bulması gereken açıklar |
| `presentCategories` | Girdide zaten karşılanan kategoriler |
| `plausibleAdditions` | Bu mutfak için makul yeni ürünler — "alakasız öneri" sayımında referans |
| `implausible` | Bu mutfak için alakasız sayılacak ürün örnekleri (regresyon kontrolü) |

`plausibleAdditions` kapalı bir liste **değildir**: alaka ölçümü önce mutfak grafiğindeki onaylı
şablonlara bakar, listeye yalnızca şablon havuzunda karşılığı olmayan öneriler için başvurulur.
