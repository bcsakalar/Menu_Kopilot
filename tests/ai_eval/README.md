# AI değerlendirme düzeneği

Menü asistanının önerilerini 27 mutfak × {yazı, fotoğraf} × {hızlı, tam} matrisinde, tek ürün akışında ve depodaki
gerçek fotoğraflarla ölçer (141 senaryo). Raporlar: `docs/ai-eval/baseline-report.md`, `docs/ai-eval/after-report.md`.

## Dosyalar

| dosya | ne yapar |
|---|---|
| `menus.mjs` | 27 elle yazılmış Türkçe paket menüsü, "tek ürün" girdileri, depo fotoğrafları |
| `render-images.mjs` | menüleri başsız Chrome ile beş stilde fotoğrafa çevirir → `images/` |
| `run.mjs` | senaryoları yerel API'ye gönderir, kartları, izleme kaydını ve sağlayıcı kullanımını `results/<etiket>/` altına yazar |
| `rules.mjs` | puanlama kuralları — backend'in kendi doğrulamasından bağımsız |
| `score.mjs` | sonuçları puanlar → `results/<etiket>/summary.json`, `--md` ile markdown tablo |
| `sample.mjs` | elle inceleme için sabit tohumlu 40 ürünlük örneklem |
| `docker-compose.eval.yml` | yalnızca bu ölçüm için günlük kotayı kaldıran ek ayar |

## Çalıştırma

```bash
docker compose -f docker-compose.yml -f tests/ai_eval/docker-compose.eval.yml up -d --build api
node --env-file=.env tests/ai_eval/run.mjs --label after
node tests/ai_eval/score.mjs --label after --md
node tests/ai_eval/sample.mjs --label after --n 40
```

`run.mjs` var olan sonuçları atlar (önbellek); `--force` yeniden çalıştırır, `--only kebap-izgara,pizza`,
`--kinds text,photo`, `--modes quick` alt küme seçer. Sağlayıcı sıkıntısında (zaman aşımı, 429, devre kesici) senaryo
75 sn sonra bir kez daha denenir; senaryolar arasında bekleme ücretsiz katman sınırları içindir. Sağlayıcıların
günlük kotası bittiğinde yeniden deneme yalnızca bekletir: `--no-retry --pause 2` yedek yolu olduğu gibi ölçer.
