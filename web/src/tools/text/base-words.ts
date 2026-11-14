/**
 * The menu vocabulary the text tool knows before the live pool's words arrive (D-218): products, ingredients, cooking,
 * portions and the words of a short panel description. The pool adds thousands more (GET /api/v1/tools/lexicon); this
 * list is what makes the tool right from the first keystroke and what its tests rely on. Lowercase, Turkish spelling.
 */
export const BASE_WORDS = `
acı acılı acısız adana ahtapot akdeniz alabalık ana antep antrikot armut ayran ayva az aşure
baharat baharatlı baklava bal ballı balık bamya barbunya bazlama beyaz beyti bezelye biber biberli biftek bir birlikte
bisküvi bol bonfile boy boyu boza böğürtlen börek böreği bulgur burger but büyük buzlu buğulama
cacık ceviz cevizli ciğer cola cheddar cheesecake
çay çayı çeyrek çift çiğ çikolata çikolatalı çilek çilekli çipura çiçek çorba çorbası çöp çıtır
dana dereotu dilim doğal dolgulu dolma dolması domates domatesli dondurma dondurmalı dört döner dönerli dürüm dürümü duble
ekmek ekmeği ekstra elma enfes erişte espresso et etli ev eşliğinde edilir eklenir
falafel fasulye fesleğen filtre fındık fındıklı fırın fırında fırınlanmış fıstık fıstıklı frambuaz frappe
garnitür gazoz geleneksel gibi gözleme güveç güzel günlük gram
halka halkası hamburger hamsi hamur harmanlanır haşlama haşlanmış havuç hazırlanır hazırlanan helva hindi hindistancevizi
ıhlamur ılık ıslak ıspanak ızgara ızgarada
ıce ıced ile ilave ince iyi için içecek içeceği içi içinde iki ikili iskender işkembe
jambon
kabak kadayıf kahvaltı kahvaltılık kahve kahvesi kakao kakaolu kalamar kalın kanat kapya karamel karamelli karides karışık
kase kaşar kaşarlı kavurma kavurmalı kavrulmuş kaymak kaymaklı kayısı kazandibi kebap kebabı kek kelle kepekli kereviz keşkül
kiraz kişilik kızartma kızartması kızarmış kıyma kıymalı kola konya köfte köftesi köy kokoreç köz közde közlenmiş közlü kremalı krema
krep kruvasan kuru kurabiye kuzu kuşbaşı kuşbaşılı kutu kullanılır kümes künefe kumpir
labne lahana lahmacun latte lavaş lezzetli limon limonata limonlu lokma lokum lor
makarna maden mangal mangalda mantar mantarlı mantı mantısı marul maydanoz menü menüsü mercimek meyve meyveli meze mezesi
midye milkshake mısır mozzarella muhallebi muz muzlu mutlu mocha
nane naneli nar nefis nohut
odun olarak organik orta otlu
pasta pastane pastanesi pastırma pastırmalı patates patlıcan paket peynir peynirli pırasa pide pidesi pilav pilavı pirinç
pirzola pişirilir pişmiş pizza pizzası poğaça portakal profiterol puding pul
revani roka
sade sahlep salam salata salatası salatalık sandviç sarma sarması sarımsak sarımsaklı sebze sebzeli servis set sıcak simit
smoothie soda soğan soğanlı soğuk somon sos soslu sosu sosis sote sucuk sucuklu sunulur su suyu süt sütlaç sütlü
şalgam şeftali şekerpare şekilde şeklinde şerbet şiş şişe şişte
tabak tabağı tam tantuni tatlı tatlısı tava tavada tavuk tavuklu taze tek tereyağı tereyağlı tiramisu ton tost turşu turp
tulum tulumba türk üç üzeri üzerine üzüm
vanilya vanilyalı ve veya vişne vişneli
waffle
yağ yağlı yanında yaprak yeşil yeşillik yapımı yapılır yarım yoğurt yoğurtlu yufka yumurta yumurtalı
zeytin zeytinyağı zeytinyağlı
`;

/** How often a base word counts: enough to be trusted as a correction, less than a word the pool uses a lot. */
export const BASE_COUNT = 5;
