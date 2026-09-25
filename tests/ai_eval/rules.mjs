/**
 * Scoring rules — written by hand, deliberately INDEPENDENT of the backend's own validation. Scoring the pipeline
 * with the rules it was built from would only measure that the code agrees with itself; these encode what a person
 * on the operations team would call wrong when reading a card.
 *
 * Kinds are coarse on purpose: the question here is "does a 'Pişirme Derecesi' group make sense on this product",
 * not a full taxonomy.
 */

export function norm(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (text, words) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(text));
const hasPrefix = (text, words) => words.some((w) => new RegExp(`(^| )${w}`).test(text));

/** Packaged / poured drinks: on the panel a plain row — no description, no options. */
const SOFT = ['ayran', 'kola', 'cola', 'gazoz', 'soda', 'maden suyu', 'maden su', 'salgam', 'salgam suyu', 'meyve suyu', 'fanta', 'sprite', 'ice tea', 'enerji', 'kutu icecek', 'litrelik', 'nektar', 'sise su', 'pet su', 'kutu kola', 'kola zero'];
/** Made-to-order drinks: they DO get a description (and usually size/milk/syrup options). */
const HOT_DRINK = ['turk kahvesi', 'filtre kahve', 'latte', 'americano', 'espresso', 'cappuccino', 'mocha', 'macchiato', 'flat white', 'sahlep', 'salep', 'sicak cikolata', 'menengic', 'dibek', 'cay', 'bitki cayi', 'oralet', 'kahve', 'yesil cay', 'chai'];
const COLD_DRINK = ['ice latte', 'frappe', 'soguk kahve', 'cold brew', 'milkshake', 'smoothie', 'limonata', 'taze sikma', 'portakal suyu', 'mojito', 'kokteyl', 'frozen', 'buzlu', 'bubble tea', 'soguk cay'];
const DESSERT = ['baklava', 'kunefe', 'sutlac', 'kazandibi', 'trilece', 'tiramisu', 'cheesecake', 'sufle', 'profiterol', 'magnolia', 'dondurma', 'pasta', 'kek', 'brownie', 'waffle', 'helva', 'helvasi', 'lokma', 'tulumba', 'revani', 'kadayif', 'katmer', 'supangle', 'muhallebi', 'puding', 'tatlisi', 'sekerpare', 'asure', 'kemalpasa', 'ekler', 'kurabiye', 'tavuk gogsu', 'sobiyet'];
const SOUP = ['corba', 'corbasi', 'mercimek', 'ezogelin', 'iskembe', 'paca', 'yayla', 'tarhana', 'miso', 'toyga', 'lebeniye', 'anali kizli', 'tavuk suyu'];
const SALAD = ['salata', 'salatasi', 'ezme', 'ezmesi', 'haydari', 'humus', 'fava', 'saksuka', 'cacik', 'piyaz', 'meze', 'babagannus', 'muhammara', 'atom', 'coleslaw', 'bowl'];
const SIDE = ['pilav', 'pilavi', 'patates', 'pure', 'puresi', 'sogan halkasi', 'sarimsakli ekmek', 'tursu', 'garnitur', 'mantar sote'];
const BAKERY = ['simit', 'pogaca', 'acma', 'kruvasan', 'borek', 'boregi', 'corek', 'catal', 'boyoz', 'gozleme', 'pisi'];
const BREAKFAST = ['kahvalti', 'menemen', 'omlet', 'yumurta', 'yumurtali', 'kaygana', 'cilbir', 'kuymak', 'pankek'];
const MEAT = ['kebap', 'kebabi', 'sis', 'kofte', 'doner', 'iskender', 'beyti', 'adana', 'urfa', 'steak', 'bonfile', 'antrikot', 'pirzola', 'kaburga', 'kavurma', 'tantuni', 'kokorec', 'ciger', 'et', 'tomahawk', 'kulbasti', 'dallas'];
const CHICKEN = ['tavuk', 'tavuklu', 'kanat', 'nugget', 'citir', 'schnitzel', 'sinitzel', 'fajita'];
const FISH = ['balik', 'baligi', 'levrek', 'cipura', 'hamsi', 'somon', 'kalamar', 'karides', 'midye', 'istavrit', 'mezgit', 'ton'];
const PIZZA = ['pizza', 'margherita', 'pepperoni'];
const PIDE = ['pide', 'lahmacun', 'etli ekmek'];
const BURGER = ['burger', 'hamburger', 'cheeseburger'];
const WRAP = ['durum', 'wrap', 'burrito', 'tacos', 'taco', 'quesadilla', 'sandvic', 'tost', 'tostu', 'kumru', 'ekmek arasi', 'shawarma'];
const PASTA = ['makarna', 'spagetti', 'penne', 'fettuccine', 'lazanya', 'ravioli', 'noodle', 'ramen', 'gnocchi', 'manti', 'mantisi', 'eriste'];
const COMBO = ['menu', 'menusu', 'paket', 'paketi', 'kampanya', 'kampanyasi', 'kombo'];

/** A product's kind from its name (and category as a tie-breaker). Order matters: the specific before the general. */
export function productKind(name, categoryKey = '') {
  const n = norm(name);
  // "Su" alone (or bottled water) is a drink; "Su Böreği" is not.
  if (n === 'su' || /^(sise|pet|dogal kaynak|kaynak) suyu?$/.test(n) || /^su \d/.test(n)) return 'soft-drink';
  if (has(n, COMBO)) return 'combo';
  if (has(n, COLD_DRINK) || /milkshake|smoothie|frappe/.test(n)) return 'cold-drink';
  if (has(n, HOT_DRINK)) return 'hot-drink';
  if (has(n, SOFT) || categoryKey === 'icecek') return has(n, SOFT) ? 'soft-drink' : 'cold-drink';
  if (has(n, DESSERT) || categoryKey === 'tatli') return 'dessert';
  if (has(n, SOUP) || categoryKey === 'corba') return 'soup';
  if (has(n, PIZZA)) return 'pizza';
  if (has(n, PIDE)) return 'pide';
  if (has(n, BURGER)) return 'burger';
  if (has(n, WRAP)) return 'wrap';
  if (has(n, PASTA)) return 'pasta';
  if (has(n, BREAKFAST)) return 'breakfast';
  if (has(n, FISH)) return 'fish';
  if (has(n, CHICKEN)) return 'chicken';
  if (has(n, MEAT)) return 'meat';
  if (has(n, SALAD) || categoryKey === 'salata-meze') return 'salad';
  if (has(n, SIDE) || categoryKey === 'yan-urun') return 'side';
  if (has(n, BAKERY)) return 'bakery';
  return 'food';
}

export const DRINKS = new Set(['soft-drink', 'hot-drink', 'cold-drink']);
const MAINS = new Set(['meat', 'chicken', 'fish', 'pizza', 'pide', 'burger', 'wrap', 'pasta', 'breakfast', 'food', 'combo']);

/** Option groups that only make sense on some kinds of product. */
const GROUP_RULES = [
  { re: /pisirme derecesi|pisme derecesi|az pismis|orta pismis/, only: ['meat', 'burger'], why: 'pişirme derecesi' },
  { re: /sut secimi|sut tercihi|sut turu|surup|shot|espresso/, only: ['hot-drink', 'cold-drink'], why: 'süt / şurup / shot' },
  { re: /aci seviyesi|acilik|aci tercihi|baharat seviyesi|acili mi/, not: ['dessert', 'hot-drink', 'cold-drink', 'soft-drink'], why: 'acı seviyesi' },
  { re: /ekmek secimi|ekmek tercihi|ekmek turu|lavas secimi/, not: ['dessert', 'hot-drink', 'cold-drink', 'soft-drink', 'pizza', 'pasta', 'bakery'], why: 'ekmek seçimi' },
  { re: /hamur secimi|hamur tercihi|hamur turu|hamur kalinligi/, only: ['pizza', 'pide', 'bakery', 'breakfast', 'dessert', 'wrap', 'food'], why: 'hamur seçimi' },
  { re: /pilav secimi|pilav tercihi|pilav turu/, not: ['dessert', 'hot-drink', 'cold-drink', 'soft-drink', 'pizza', 'bakery', 'soup', 'burger'], why: 'pilav seçimi' },
  { re: /icecek secimi|icecek tercihi|yanina icecek/, not: ['hot-drink', 'cold-drink', 'soft-drink', 'dessert', 'soup', 'side', 'salad'], why: 'içecek seçimi' },
  { re: /(^| )buz|seker miktari|seker secimi|seker tercihi|tatlandirici/, only: ['hot-drink', 'cold-drink', 'soft-drink', 'dessert'], why: 'buz / şeker' },
  { re: /pisirme sekli|pisirme yontemi/, not: ['hot-drink', 'cold-drink', 'soft-drink', 'dessert', 'salad', 'soup'], why: 'pişirme şekli' },
];

/** Option groups that are really ingredient lists — the thing the user explicitly wants in its own section. */
const INGREDIENT_GROUP = /ekstra malzeme|ekstralar|ekstra secimi|ilave malzeme|ek malzeme|^icine$|icindekiler|cikarilacak|istemediginiz|cikarmak istediginiz|malzeme cikar|cikarilabilir/;
/** A group that only switches one ingredient on or off ("Soğan: Soğanlı / Soğansız"). Seasoning levels are real choices. */
const WITHOUT_OPTION = /(siz|suz)$/;
const PREFERENCE = /(^| )(aci|acilik|baharat|seker|tuz|pisme|pisirme|sicaklik)/;
const SAVORY = ['sogan', 'sarimsak', 'aci sos', 'tursu', 'ketcap', 'mayonez', 'domates', 'biber', 'maydanoz', 'pul biber', 'lavas'];
const FOOD_IN_DRINK = ['pilav', 'patates', 'lavas', 'ekmek', 'sogan', 'kofte', 'et'];

/**
 * Everything wrong with one product's suggestion, as a list of short Turkish reasons. `absurd` are the ones a person
 * would call nonsense; `separation` the ones where options and ingredients are mixed; `weak` the thin-but-not-wrong.
 */
export function inspectProduct(product) {
  const kind = productKind(product.name, product.categoryKey);
  const absurd = [];
  const separation = [];
  const weak = [];
  const seen = new Set();

  for (const group of product.optionGroups) {
    const g = norm(group.name);
    if (seen.has(g)) weak.push(`"${group.name}" iki kez`);
    seen.add(g);
    if (INGREDIENT_GROUP.test(g)) separation.push(`malzeme listesi opsiyon grubu olarak: "${group.name}"`);
    const toggles = group.options.filter(([name]) => WITHOUT_OPTION.test(norm(name).split(' ').pop() ?? '') && norm(name).length > 5);
    if (!PREFERENCE.test(g) && toggles.length > 0 && toggles.length * 2 >= group.options.length) {
      separation.push(`malzeme aç/kapa opsiyon grubu olarak: "${group.name}"`);
    }
    for (const rule of GROUP_RULES) {
      if (!rule.re.test(g)) continue;
      const wrong = rule.only ? !rule.only.includes(kind) : rule.not.includes(kind);
      if (wrong) absurd.push(`${rule.why} → ${kind} ürününde ("${group.name}")`);
    }
    const options = group.options.map(([name]) => norm(name));
    if (options.length < 2) weak.push(`"${group.name}" tek seçenekli`);
    if (kind === 'dessert' && options.some((o) => has(o, SAVORY))) absurd.push(`tatlıda tuzlu seçenek ("${group.name}")`);
    if (DRINKS.has(kind) && options.some((o) => has(o, FOOD_IN_DRINK))) absurd.push(`içecekte yemek seçeneği ("${group.name}")`);
    if (options.some((o) => o.startsWith('ekstra ')) && !/ekstra|ilave/.test(g)) separation.push(`"Ekstra …" seçeneği opsiyon grubunda ("${group.name}")`);
  }

  const removables = product.removableIngredients.map(norm);
  const extras = product.extraIngredients.map(norm);
  if (removables.some((r) => r.startsWith('ekstra '))) separation.push('"Ekstra …" çıkarılabilir listesinde');
  if (extras.some((e) => /(siz|suz)$/.test(e.split(' ').pop() ?? '') || e.startsWith('cikar'))) separation.push('"…sız" ekstra listesinde');
  if (removables.some((r) => extras.includes(r))) separation.push('aynı malzeme hem çıkarılabilir hem ekstra');
  const groupNames = product.optionGroups.map((group) => norm(group.name));
  if (extras.some((e) => groupNames.includes(e))) separation.push('aynı şey hem opsiyon grubu hem ekstra');
  if ((kind === 'dessert' || DRINKS.has(kind)) && removables.some((r) => has(r, SAVORY))) absurd.push(`${kind} ürününde tuzlu çıkarılabilir malzeme`);

  const groupsNeeded = MAINS.has(kind) ? 2 : 1;
  if (kind !== 'soft-drink' && product.optionGroups.length > 0 && product.optionGroups.length < groupsNeeded) {
    weak.push(`${kind} için ${product.optionGroups.length} grup az`);
  }

  return { kind, absurd, separation, weak };
}

export function words(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w)).length;
}

/** Similar enough to be the same product ("Kuşb. Pide" / "Kuşbaşılı Pide", "Mercimek" / "Mercimek Çorbası"). */
export function sameProduct(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = new Set(x.split(' '));
  const ty = new Set(y.split(' '));
  // One name inside the other, as whole words ("Mercimek" / "Mercimek Çorbası") — never as letters: "Su" is not
  // inside "Fırın Sütlaç".
  const [short, long] = tx.size <= ty.size ? [tx, ty] : [ty, tx];
  if ([...short].every((t) => long.has(t) || (t.length >= 4 && [...long].some((u) => u.startsWith(t))))) return true;
  const inter = [...tx].filter((t) => ty.has(t) || [...ty].some((u) => u.startsWith(t.slice(0, 4)) && t.length >= 4)).length;
  return inter / Math.max(tx.size, ty.size) >= 0.6;
}

/** Products that do not belong to the cuisine at all — a hallucination signal for the "new product" section. */
const FAMILY = {
  turk: ['kebap-izgara', 'doner', 'pide-lahmacun', 'kofte', 'cigkofte', 'ev-yemekleri', 'corba', 'manti-hamur-isleri', 'sokak-lezzetleri', 'tantuni', 'borek', 'meze', 'balik-deniz'],
  fast: ['burger', 'tavuk', 'pizza', 'tost-sandvic'],
  dunya: ['makarna', 'uzak-dogu', 'dunya-mutfagi', 'steak', 'salata-saglikli'],
  tatli: ['tatli', 'dondurma', 'kafe-icecek', 'pastane-firin', 'kahvalti'],
};
const ALIEN = {
  turk: ['sushi', 'roll', 'ramen', 'noodle', 'taco', 'tacos', 'burrito', 'quesadilla', 'nachos', 'spagetti', 'lazanya', 'fettuccine', 'penne', 'wok', 'teriyaki'],
  fast: ['sushi', 'ramen', 'iskembe', 'kelle', 'paca', 'manti', 'baklava', 'kunefe'],
  dunya: ['iskembe', 'kelle', 'paca', 'kokorec', 'lahmacun', 'cig kofte', 'tantuni'],
  tatli: ['iskembe', 'kelle', 'kokorec', 'kebap', 'lahmacun', 'sushi', 'ramen'],
};
export function alienToCuisine(name, slug) {
  const family = Object.keys(FAMILY).find((f) => FAMILY[f].includes(slug));
  if (!family) return false;
  return hasPrefix(norm(name), ALIEN[family]);
}
