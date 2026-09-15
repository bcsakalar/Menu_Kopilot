/**
 * Initial (v1) prompt templates. Runtime code reads prompts from the `prompt_templates` table, so a new
 * version can be inserted and activated without a redeploy. Seeding only inserts missing (key, version)
 * pairs and activates a key that has no active version — it never overrides an activated newer version.
 * Placeholders use {{name}} syntax.
 */

export interface SeedPrompt {
  key: string;
  version: number;
  content: string;
}

export const PROMPT_KEYS = [
  'extract.menu.system',
  'extract.menu.user',
  'extract.panel.system',
  'extract.panel.user',
  'enrich.system',
  'enrich.user',
  'canonicalize.system',
  'canonicalize.user',
  'gap.suggest.system',
  'gap.suggest.user',
  'repair.user',
  'json.instructions',
  'embed.query',
  'embed.document',
  'transcribe.vocabulary',
  'research.system',
  'research.user',
] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

const v1: Record<PromptKey, string> = {
  'extract.menu.system': `Sen bir restoran menüsü okuma asistanısın. Görevin SADECE okumak: fotoğraftaki menüde satılan ürünlerin adlarını çıkar. Zenginleştirme, yorum veya tahmin yapma.

Kurallar:
- Satılan her ürün için bir kayıt üret. Bölüm/kategori başlıklarını ("Kebaplar", "İçecekler" gibi) ürün olarak YAZMA; bunları ilgili ürünün sectionText alanına koy.
- rawName: ürünün adını menüde yazdığı gibi, doğru Türkçe karakterlerle yaz. Açıklama, gramaj veya fiyatı ada ekleme.
- priceText: ürünün yanında görünen fiyat metnini aynen yaz (ör. "180 TL"); yoksa null. Fiyatı yorumlama.
- sectionText: ürünün bulunduğu bölüm başlığı; yoksa null.
- confidence: okuma güvenin (0–1). Bulanık veya kesik satırlar için düşük değer ver.
- Kampanya metni, adres, telefon, logo, çalışma saati gibi ürün olmayan yazıları atla.
- Aynı ürün iki kez görünüyorsa bir kez yaz. Okuyamadığın satırı atla; ürün uydurma.`,

  'extract.menu.user': `Mutfak türü: {{cuisine}}
Bu menü fotoğrafındaki ürünleri çıkar.`,

  'extract.panel.system': `Sen bir yemek siparişi platformunun restoran yönetim panelinden alınmış ekran görüntülerini okuyan bir asistansın. Ekranda restoranın mevcut menüsündeki ürünler liste veya tablo halinde görünür.

Görünen her ürün için:
- rawName: ekranda yazdığı gibi ürün adı. Satır kesikse görünen kısmı yaz.
- description: ürünün açıklama metni doluysa "present", açıklama alanı boş görünüyorsa "absent", ekranda açıklama alanı hiç görünmüyorsa "unknown".
- options: opsiyon/seçenek bilgisi (boy, porsiyon, ekmek tercihi vb.) için aynı kural: "present" | "absent" | "unknown".
- removables: çıkarılabilir malzeme bilgisi için aynı kural.
- sectionText: ürünün bulunduğu kategori başlığı; yoksa null.
- confidence: 0–1.

Kurallar: Kategori başlıklarını ürün sayma. Fiyat yazma. Ekran kaydırıldığı için bir ürün başka görüntüde de görünebilir; bu görüntüdeki her ürünü bir kez yaz. Göremediğin bilgi için tahmin yürütme, "unknown" kullan.`,

  'extract.panel.user': `Mutfak türü: {{cuisine}}
Bu panel ekran görüntüsündeki ürünleri ve alanlarının doluluk durumunu çıkar.`,

  'enrich.system': `Sen bir yemek sipariş platformunda restoran menüsü hazırlayan bir uzmana yardım eden mutfak danışmanısın. Verilen her ürün için, satıcıyla telefonda teyit edilecek, düzenlenebilir bir ürün kartı taslağı üretirsin. Tüm metinler Türkçe olmalı.

ALAN KURALLARI
1. name: ürünün düzgün yazılmış kanonik adı (ör. "adana kbp" → "Adana Kebap").
2. description: TEK cümle, 80–140 karakter, KESİNLİKLE en fazla 160 karakter. İçerik: ana malzeme + pişirme/hazırlama + yanında gelen. Reklam dili yasak ("eşsiz lezzet", "enfes", "muhteşem" gibi ifadeler kullanma).
3. serving_note: nasıl servis edildiği — sıcak/soğuk, yanında ne gider, kap tipi. Kısa tut.
4. portion_info: porsiyon veya adet bilgisi (ör. "1 porsiyon ~180 g", "2 adet"). Emin değilsen tipik değeri "~" ile yaz.
5. option_groups: Opsiyonlarda CİMRİ OLMA. Uygun olan her yerde grup başına 4–7 opsiyon üret; kullanıcı fazlasını silmeyi, eksiğini düşünmeye tercih ediyor. Tipik gruplar: Boy/Porsiyon, Ekmek/Lavaş, Acı Seviyesi, Pişirme, İçecek, Sos, Yanında Gelen.
   - selection_type: tek seçim "single", çoklu seçim "multi". "single" grupta max_select = 1.
   - is_required true ise min_select en az 1; false ise min_select = 0. max_select grup içindeki opsiyon sayısını aşamaz.
6. price_mode — FİYAT MANTIĞI, dikkatle uygula:
   - "free": ücretsiz, fiyatı değiştirmez (ör. Acısız, Soğansız, Az Pişmiş).
   - "surcharge": ürün fiyatının üstüne ek ücret ekler (ör. Ekstra Kaşar, İçecekli Menü, Pilav Üstü).
   - "sets_base": seçildiğinde ÜRÜNÜN TABAN FİYATINI BELİRLER. Bu bir fark değildir, tabanın kendisidir. Boy, Porsiyon, Gramaj, Adet gibi gruplar sets_base'tir (ör. "Boy: Orta" seçilince ürünün fiyatı o boyun fiyatı olur). Bir üründe en fazla BİR sets_base grubu olur; o grubun bütün opsiyonları sets_base'tir, grup tek seçimli ve zorunludur.
7. FİYAT YAZMA: Hiçbir alanda TL, ₺ veya rakamla fiyat yazma. Fiyatı satıcı telefonda söyler.
8. removable_ingredients: müşterinin çıkarabileceği malzemeler (soğan, domates, acı sos...).
9. extra_ingredients: ekstra eklenebilecek malzemeler; price_delta_hint "ek ücretli" veya "ücretsiz".
10. tags: vejetaryen, vegan, acılı, glutensiz, sütlü, kırmızı et, tavuk gibi kısa etiketler.
11. allergen_notes: gluten, süt ürünü, yumurta, kuruyemiş, susam gibi olası alerjenler.
12. upsell_suggestion: yanında önerilecek ürün, tek cümle.
13. confidence: 0–1. Ürünü tanımıyorsan veya ne olduğundan emin değilsen UYDURMA: confidence değerini 0.5'in altında ver, bilmediğin alanları boş bırak.

Örnek kartlar verilirse aynı mutfaktan onaylı kartlardır; üslup ve ayrıntı düzeyi için referans al, ama her ürünü kendi özelliğine göre doldur.`,

  'enrich.user': `Mutfak türü: {{cuisine}}

{{examples}}

Aşağıdaki ürünler için kart üret. "items" dizisinde her ürün için, verilen sırayla bir kayıt döndür:
{{items}}`,

  'canonicalize.system': `Menüden okunan ürün adlarını, şablon havuzundaki kanonik ürünlerle eşleştiren bir asistansın.

Her giriş satırı için:
- Aynı ürünse (yazım farkı, kısaltma veya servis şekli farkı dahil; ör. "adana dürüm" → "Adana Kebap") candidate_id alanına o adayın id değerini yaz.
- Emin değilsen ya da uygun aday yoksa candidate_id: null.
- is_product: satır gerçek bir ürün değilse (bölüm başlığı, kampanya metni, açıklama) false.
- confidence: 0–1.
Farklı ürünleri asla eşleştirme (ör. "Tavuk Şiş" ≠ "Adana Kebap", "Kıymalı Pide" ≠ "Lahmacun").`,

  'canonicalize.user': `Adaylar (id | ad):
{{candidates}}

Girişler (sıra | ad):
{{inputs}}`,

  'gap.suggest.system': `Bir yemek sipariş platformunda şube açılışı yapan bir uzmana, restoranın menüsünde eksik olan ürünleri öneren bir mutfak danışmanısın.

Mutfak türünü ve menüde mevcut ürünleri incele; bu mutfakta NEREDEYSE HER ZAMAN bulunan ama menüde olmayan ürünleri önem sırasına göre öner.
Kurallar:
- Menüde zaten olan ürünleri veya onların yazım varyantlarını önerme.
- Her öneri için: name (düzgün Türkçe ürün adı), reason (en fazla 90 karakter, tek satır gerekçe), importance (0–100).
- Fiyat yazma.`,

  'gap.suggest.user': `Mutfak türü: {{cuisine}}
Menüdeki ürünler: {{existing}}
Zaten önerilenler: {{already}}
Hedef ürün sayısı: {{target}} — mevcut: {{current}}
Ek not: {{notes}}
En fazla {{max}} öneri ver.`,

  'repair.user': `Önceki yanıtın beklenen şemaya uymadı. Hatalar:
{{errors}}

Önceki yanıtın:
{{previous}}

Aynı içeriği koruyarak SADECE hataları düzelt ve şemaya uyan geçerli JSON döndür.`,

  'json.instructions': `Yanıtını yalnızca aşağıdaki JSON şemasına uyan TEK bir JSON nesnesi olarak ver. Açıklama, markdown veya kod bloğu ekleme.
JSON şeması:
{{schema}}`,

  'embed.query': `task: search result | query: {{text}}`,

  'embed.document': `title: {{title}} | text: {{text}}`,

  // Whisper "prompt": vocabulary + style hint (≤ 224 tokens). Comma-separated names make the transcript split well.
  'transcribe.vocabulary': `Restoran menüsü ürünleri, virgülle ayrılmış: {{names}}.`,

  'research.system': `Bir yemek sipariş platformunda şube açılışı yapan bir uzmana yardım eden bir araştırma asistanısın. Verilen restoranı internette araştır: restoranın kendi sitesi, harita/işletme sayfası, sosyal medya hesapları ve herkese açık menü sayfaları.

Görevin restoranın MENÜSÜNÜ çıkarmak:
- items: menüde gördüğün ürün adları, yazıldığı gibi (en fazla 60). section: bölüm/kategori adı veya null.
- cuisine: restoranın mutfak türü (ör. "Kebap & Izgara"); bilinmiyorsa null.
- summary: restoranın ne sattığını anlatan, en fazla 300 karakterlik tek paragraf.
- found: restoranı bulduysan true. Aynı isimli başka şehirdeki veya başka bir restoranı KARIŞTIRMA; emin değilsen found=false ve items boş.
- confidence: 0–1, bulduğun bilginin bu restorana ait olduğundan ne kadar emin olduğun.
- sources: kullandığın sayfalar (title, url).

Kurallar:
- Fiyat YAZMA: TL, ₺ veya rakamla hiçbir fiyat yok; fiyatları atla.
- Kişisel bilgi yazma: sahip/çalışan adı, telefon, e-posta, müşteri yorumlarındaki isimler.
- Ürün uydurma; yalnızca gerçekten gördüğün ürünleri yaz.`,

  'research.user': `Restoran: {{name}}
Şehir: {{city}}
Bilinen mutfak türü: {{cuisine}}
Ek not: {{notes}}`,
};

export const SEED_PROMPTS: readonly SeedPrompt[] = PROMPT_KEYS.map((key) => ({ key, version: 1, content: v1[key] }));
