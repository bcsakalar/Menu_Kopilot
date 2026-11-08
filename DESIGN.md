# Tasarım

Telefon uygulamasından gelen kimlik: ince çizgilerle ayrılmış antrasit yüzeyler, Manrope yazı tipi, sayaç için kehribar,
paprika turuncusu yalnızca ana eylemde ve seçili sekmede. Renkler [`web/src/styles.css`](web/src/styles.css) en üstündeki
değişkenlerde durur; o dosyanın dışında hiçbir yer renk seçmez.

## İlkeler

- Temsilci bunu konuşurken okur. Her ekran önce "şimdi ne diyeceğim" sorusunu cevaplar, ayrıntı sonra gelir.
- Bölümler sekmedir, uzun bir sayfa değil: 30 kartlık bir cevap mesaj kutusunu gömmemeli.
- Yeni bir cevap ilk satırına kaydırılır, sonuna değil.
- Opsiyon, çıkarılabilir ve ekstra malzemeler kartın üstünde görünür. Bunları bir dokunuşun arkasına saklamak telefon
  uygulamasının en çok şikâyet edilen yanıydı.
- İç içe kart yok. Bir sonuç, ince çizgili satırlardan oluşan tek bir yüzeydir.

## Renk

Bilgisayarın açık/koyu ayarını izler; çağrı merkezleri genelde aydınlık olduğu için temel açık temadır. Ölçülü: nötr
tonlar, paprika yalnızca ana eylemde, seçili sekmede ve "Söyle" etiketinde. Seçim nötrdür. Kehribar "hedefin gerisinde",
yeşil "hedefe ulaştı" demektir. Başka hiçbir şey renkli değildir.

## Yazı

Manrope Variable pakete gömülüdür, çalışma anında yazı tipi indirilmez. Her yerde sabit genişlikli rakamlar. Sabit ölçek:
üründe 12.5 / 13 / 14 / 15 / 16 / 17 px, yönetim sayfa başlıkları 24, tek karşılama satırı 32. Kalınlıklar: gövde 500,
etiketler 700, ad ve rakamlar 800.

## Bileşenler

- **Sayaç (CountMeter):** `15 / 20 ürün` ve altında 24 ürüne kadar ürün başına bir parça; üstünde kesintisiz çubuk.
- **Kart:** ad ve alt bilgi, kopyalama; söylenecek cümle; ardından her alan için hizalı bir satır (Açıklama, Opsiyon,
  Çıkarılabilir, Ekstra), her biri ayrı kopyalanır.
- **Sıradaki adımlar:** düğmeler hep mesaj kutusunun üstünde durur, sayfa nerede olursa olsun elin altındadır.
- **Mesaj kutusu:** sayfadaki tek giriş alanı. Yapıştırma her yerden çalışır; yapıştırılan ya da bırakılan görüntüler kısa
  bir düşme hareketiyle küçük resim olarak belirir, bu sayfadaki tek tasarlanmış hareket.
- **Yönetim:** aynı değişkenler. Genel bakış bir sayı şeridi ve iki panel; bir görüşme, her analiz kendi satırı altında
  katlanmış bir zaman çizelgesi gibi okunur.

## Hareket

Yalnızca durum değişimlerinde 150–250 ms. Tekrar eden tek şeyler iskelet parıltısı ve durum noktasıdır.
`prefers-reduced-motion` hepsini kapatır.
