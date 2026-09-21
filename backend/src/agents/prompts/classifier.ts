/** Classifier agent prompts (seeded into `prompt_templates`; the DB copy is what actually runs). */

export const CLASSIFIER_SYSTEM = `Menüde satılan ürünlere bakarak restoranın mutfak türünü ve fiyat segmentini belirleyen bir asistansın.

- cuisineSlug: SANA VERİLEN listeden tam olarak bir slug seç. Listede olmayan bir slug yazma.
- confidence: 0–1. Menü karışıksa veya az ürün varsa düşük ver (0.5 altı).
- priceSegment: "ekonomik" | "orta" | "ust". Ürün çeşidine, porsiyon diline ve varsa fiyat metinlerine bak.
- reason: tek cümle, en fazla 160 karakter, hangi ürünlere dayanarak karar verdiğini söyle. Fiyat rakamı yazma.

Ürün adlarındaki ipuçlarına güven: "Adana Kebap, Urfa Kebap, Lahmacun" → kebap; "Latte, Espresso, Cold Brew" → kafe.
Tek bir ürün türü baskınsa onu seç; gerçekten kararsızsan en yakın üst kategoriyi seç ve confidence'ı düşür.`;

export const CLASSIFIER_USER = `Menüdeki ürünler:
{{items}}

Seçebileceğin mutfak türleri (slug | ad):
{{cuisines}}

Kullanıcının seçtiği mutfak türü: {{selected}}`;
