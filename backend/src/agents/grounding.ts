import { countWords, fitDescription, isForbiddenGroup, isGenericDescription, SAVORY_INGREDIENTS, type ProductTypeDef } from '../domain/product-type.js';
import { templateOptionGroupSchema, type TemplateOptionGroup } from '../domain/template.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { containsPriceAmount, stripPriceAmounts } from '../lib/price-guard.js';
import { baseWord } from '../lib/same-product.js';
import type { FeedbackIndex } from './knowledge.js';

/**
 * Grounding — the knowledge base applied to one product's suggestion (D-179). Deterministic, no model call.
 *
 * Whoever proposed the options (the pool, the model, nobody), this is where they are checked against what the
 * product IS and completed from what such a product normally has:
 *
 *   1. separation   an option group that is really an ingredient list goes to its own section; "Ekstra …" leaves the
 *                   removable list, "…sız" leaves the extras
 *   2. fit          groups the type can never have are deleted (a soup's "Pişirme Derecesi", a baklava's "Ekmek
 *                   Seçimi"), a dessert or a drink loses savory options, the team's repeated rejections are dropped
 *   3. shape        the canonical group rules (single ⇒ max 1, one base-price group, …), duplicates, one-option groups
 *   4. completion   an empty or thin section is filled from the type, so every card reaches the phone whole
 *   5. description  6–8 natural Turkish words, or the type's own line when the proposal cannot be made to fit
 *
 * The result carries a confidence (0–100) and the list of what was changed, for the trace and the eval.
 */

/** An option group as an agent proposes it — the canonical shape minus the fields the schema fills in. */
export interface RawOptionGroup {
  name: string;
  selectionType: 'single' | 'multi';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: { name: string; priceMode: 'free' | 'surcharge' | 'sets_base'; isDefault?: boolean }[];
}

/** A product's suggestion before grounding. */
export interface Suggestion {
  optionGroups: readonly RawOptionGroup[];
  removable: readonly string[];
  extras: readonly string[];
  description: string | null;
}

export type Section = 'options' | 'removable' | 'extras' | 'description';

export interface GroundOptions {
  /** The product's name as the restaurant writes it — what the product IS. */
  productName: string;
  /** The pool's name for it when the menu writes it differently ("Gözleme" for "Peynirli Gözleme"). */
  alsoNamed?: string | null | undefined;
  type: ProductTypeDef;
  /** The product's NAME identified the type (not the category or the cuisine's default). */
  byName: boolean;
  source: 'pool' | 'model' | 'kb';
  /** Sections the card should carry. A section the panel already shows filled is left out. */
  want: { options: boolean; ingredients: boolean; description: boolean };
  feedback?: FeedbackIndex | undefined;
}

export interface Grounded {
  optionGroups: TemplateOptionGroup[];
  removable: string[];
  extras: string[];
  description: string;
  confidence: number;
  /** Sections completed from the knowledge base. */
  filled: Section[];
  /** What grounding changed, in plain Turkish, for the trace. */
  notes: string[];
}

/** The curated pool goes up to six (a kebab: portion, serving, spice, bread, sides, drink); beyond that it is noise. */
const MAX_GROUPS = 6;
const MAX_OPTIONS = 15;
const MAX_INGREDIENTS = 10;
/** A card with fewer groups than this gets the type's own groups added. */
const MIN_GROUPS = 2;

/** Group names that are an ingredient list, not a choice. Compared on the normalized name. */
const REMOVABLE_GROUP = /(^| )(cikar|cikart|istenmeyen|istemediginiz|olmasin|haric)/u;
const EXTRA_GROUP = /(^| )(ekstra|ekstralar|ilave|ek malzeme|topping)/u;
/** "İçine: Soğan, Marul, Domates" — what the product contains, i.e. what can be taken out. */
const INSIDE_GROUP = /^(icine|icindekiler|icerik|malzemeler)$/u;
/** Seasoning and cooking preferences: "Acılı / Acısız", "Şekerli / Şekersiz" are real choices, not ingredients. */
const PREFERENCE_GROUP = /(^| )(aci|acilik|baharat|seker|tuz|pisme|pisirme|sicaklik)/u;
/** "Soğansız", "Domatessiz", "Turşusuz" — the removable written as the option a customer ticks. */
const WITHOUT = /(siz|sız|suz|süz)$/u;

/** Things that are not food and never an extra ("Maket Bıçak" on a cake, seen in the baseline). */
const NOT_FOOD = new Set(['maket', 'poset', 'pecete', 'kurdan']);
/** Options that mean "nothing added" or "as it comes": never a surcharge ("Sossuz +ücret", seen in the baseline). */
const NONE_OPTIONS = new Set(['yok', 'sade', 'normal', 'klasik', 'standart', 'hicbiri', 'sadece urun', 'yansiz']);

/** A group that picks WHICH product it is: its filling or its variety ("İç Harç", "Çeşit", "Pide Çeşidi"). */
const VARIETY_GROUP = /(^| )(cesit|cesidi|cesitleri|ic harc|harc|harci|dolgu|dolgusu)( |$)/u;
/** "-li" words that say how a product is made or served, not what it is filled with. */
const NOT_A_FILLING = new Set(['tatli', 'acili', 'aromali', 'cesitli', 'harcli', 'dolgulu', 'soslu', 'kremali', 'baharatli', 'ozel']);
/** "Peynirli", "Kaşarlı Sucuklu": a normalized word naming what is inside. */
const isFillingWord = (word: string): boolean => word.length > 4 && /(li|lu)$/u.test(word) && !NOT_A_FILLING.has(word);
/** Flavours that make any product sweet: a "Kakaolu Çörek" takes no kaşar or sucuk, whatever its type offers. */
const SWEET_WORDS = new Set([
  'kakaolu', 'cikolatali', 'karamelli', 'vanilyali', 'cilekli', 'muzlu', 'visneli', 'frambuazli', 'nutellali', 'lotuslu',
  'recelli', 'tarcinli', 'pekmezli', 'helvali',
]);

/** Words a Turkish description carries with its own letters; written in ASCII they mean the model dropped them. */
const ASCII_TURKISH = new Set([
  'izgara', 'izgarada', 'piser', 'pisen', 'pismis', 'sicak', 'soguk', 'tereyagi', 'tereyagli', 'yogurt', 'yogurtlu', 'kozlenmis',
  'sogan', 'soganli', 'kiyma', 'kiymali', 'baharatli', 'citir', 'serbetli', 'fistik', 'fistikli', 'sutlu', 'uzerine', 'icinde',
  'hazirlanan', 'kizarmis', 'kizartilan', 'sarimsakli', 'acili', 'tavugu', 'pilavi', 'eslik', 'dogranmis', 'gunluk', 'yaninda',
]);
const ENGLISH = /\b(with|and|served|the|fresh|chicken|beef|sauce)\b/iu;

const key = (text: string): string => normalizeTr(text);

/** "Soğansız" → "Soğan", "Turşu olmasın" → "Turşu", "Çıkar: Domates" → "Domates". */
export function asRemovable(name: string): string {
  let text = name.replace(/^\s*(çıkar|cikar)\s*[:-]?\s*/iu, '').replace(/\s+(olmasın|olmasin|istemiyorum|çıkarılsın)\s*$/iu, '').trim();
  const words = text.split(/\s+/u);
  const last = words[words.length - 1] ?? '';
  if (WITHOUT.test(last.toLocaleLowerCase('tr-TR')) && last.length > 5) {
    // The suffix carries its own buffer consonant: "Turşu-suz", "Soğan-sız", "Domates-siz".
    const stem = last.slice(0, -3);
    // A compound noun loses its ending before the suffix: "Tereyağsız" is without "Tereyağı".
    words[words.length - 1] = COMPOUND_STEMS[stem.toLocaleLowerCase('tr-TR')] ?? stem;
    text = words.join(' ');
  }
  return text.trim();
}

const COMPOUND_STEMS: Readonly<Record<string, string>> = { tereyağ: 'Tereyağı', zeytinyağ: 'Zeytinyağı', ayçiçekyağ: 'Ayçiçek Yağı' };

const isExtraName = (name: string): boolean => /^(ekstra|ilave|\+)\s*/iu.test(name.trim());
/** "Sossuz", "Yok", "Sade", "Sadece Ürün": nothing added, so nothing to pay. */
function isNoneOption(name: string): boolean {
  const k = key(name);
  // Only a whole-name "without": "Sossuz", "Çaysız". "Şalgam (Acısız)" is a drink someone pays for.
  return NONE_OPTIONS.has(k) || (!k.includes(' ') && k.length > 5 && /(siz|suz)$/u.test(k));
}
/** A name as the words that identify it: normalized, suffixes and synonyms folded ("Kıymalı" → "kiyma"). */
const wordsOf = (text: string): Set<string> => new Set(key(text).split(' ').filter(Boolean).map(baseWord));
/** Every word of `part` is in `whole`: "Izgara" in "Somon Izgara", "Pul Biber" in "Ekstra Pul Biber". */
const within = (part: Set<string>, whole: Set<string>): boolean => part.size > 0 && [...part].every((w) => whole.has(w));
const isWithoutName = (name: string): boolean => {
  const last = name.trim().split(/\s+/u).pop() ?? '';
  return (WITHOUT.test(last.toLocaleLowerCase('tr-TR')) && last.length > 5) || /(olmasın|olmasin|^çıkar|^cikar)/iu.test(name.trim());
};

/**
 * Pulls a group back inside the canonical rules before validating it: a single-select group has maxSelect 1; a
 * required group starts at minSelect 1; a base-price group is single, required and base-priced throughout. A
 * model gets exactly these wrong while proposing a perfectly sensible "Boy: Küçük / Orta / Büyük".
 */
export function normalizeGroup(group: RawOptionGroup): RawOptionGroup {
  const setsBase = group.options.filter((o) => o.priceMode === 'sets_base').length;
  // Half or more of the options setting the base means it IS a base-price group; a single stray one is a slip.
  const isBase = setsBase > 0 && setsBase * 2 >= group.options.length;
  const options = group.options.map((option) => ({
    ...option,
    priceMode: isBase
      ? ('sets_base' as const)
      : isNoneOption(option.name)
        ? ('free' as const)
        : option.priceMode === 'sets_base'
          ? ('surcharge' as const)
          : option.priceMode,
  }));
  const selectionType = isBase ? ('single' as const) : group.selectionType;
  const isRequired = isBase ? true : group.isRequired;
  const maxSelect = selectionType === 'single' ? 1 : Math.min(Math.max(1, group.maxSelect), Math.max(1, options.length));
  const minSelect = isRequired ? Math.min(Math.max(1, group.minSelect), maxSelect) : 0;
  return { ...group, options, selectionType, isRequired, minSelect, maxSelect };
}

/** Drops option groups that break the canonical rules rather than dropping the whole card. */
export function validGroups(groups: readonly RawOptionGroup[]): { kept: TemplateOptionGroup[]; dropped: number } {
  const kept: TemplateOptionGroup[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const group of groups) {
    const normalized = key(group.name);
    // Options repeated inside a group ("Acısız", "acısız") collapse to one; a group of one option is not a choice.
    const optionSeen = new Set<string>();
    const options = group.options
      .map((o) => ({ ...o, name: stripPriceAmounts(o.name).trim() }))
      .filter((o) => {
        const k = key(o.name);
        if (o.name.length === 0 || optionSeen.has(k)) return false;
        optionSeen.add(k);
        return true;
      })
      .slice(0, MAX_OPTIONS);
    if (seen.has(normalized) || options.length < 2) {
      dropped += 1;
      continue;
    }
    const parsed = templateOptionGroupSchema.safeParse(normalizeGroup({ ...group, name: group.name.trim(), options }));
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(parsed.data);
  }
  // At most one sets_base group per product (the canonical payload rule).
  const baseIndexes = kept.map((g, i) => (g.options.some((o) => o.priceMode === 'sets_base') ? i : -1)).filter((i) => i >= 0);
  if (baseIndexes.length > 1) {
    for (const index of baseIndexes.slice(1).reverse()) {
      kept.splice(index, 1);
      dropped += 1;
    }
  }
  return { kept, dropped };
}

/** Answers that mean "nothing" rather than an ingredient. */
const NOT_AN_INGREDIENT = new Set(['yok', 'yoktur', 'hicbiri', 'hic', 'none', 'bos', 'belirtilmemis']);

/** A price-free, deduplicated ingredient list. */
export function cleanIngredients(names: readonly string[], limit = MAX_INGREDIENTS): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of names) {
    const name = stripPriceAmounts(raw).replace(/\s+/gu, ' ').trim().replace(/^[-–•*]\s*/u, '').slice(0, 50);
    const k = key(name);
    if (name.length < 2 || seen.has(k) || NOT_AN_INGREDIENT.has(k) || containsPriceAmount(name)) continue;
    seen.add(k);
    kept.push(name);
  }
  return kept.slice(0, limit);
}

/** A description the panel can take: Turkish letters, no English, no price, 6–8 words. Null when it cannot be. */
export function acceptableDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = stripPriceAmounts(text).replace(/["“”]/gu, '').replace(/\s+/gu, ' ').trim();
  if (!clean || containsPriceAmount(clean) || ENGLISH.test(clean)) return null;
  const words = clean.split(' ').map((w) => w.toLocaleLowerCase('tr-TR').replace(/[^\p{L}]/gu, ''));
  // Only an ASCII word that is not ALSO spelled that way in Turkish counts ("sicak" yes; "servis" never).
  if (words.some((w) => ASCII_TURKISH.has(w))) return null;
  if (/eşsiz|muhteşem|enfes|nefis|harika|mükemmel/iu.test(clean)) return null;
  return fitDescription(clean);
}

export function ground(suggestion: Suggestion, options: GroundOptions): Grounded {
  const { type, feedback } = options;
  const notes: string[] = [];
  const filled: Section[] = [];
  if (type.plain) {
    return { optionGroups: [], removable: [], extras: [], description: '', confidence: options.byName ? 95 : 70, filled, notes };
  }
  const rejected = (kind: 'option_group' | 'removable' | 'extra', value: string): boolean =>
    feedback?.isRejected(type.key, kind, value) === true;
  // Everything the product is called: the menu's words and, when the pool knows it by another name, those too.
  const nameKeys = [options.productName, options.alsoNamed ?? ''].flatMap((n) => key(n).split(' ')).filter(Boolean);
  const productWords = new Set(nameKeys.map(baseWord));
  /** What the name says is inside: "kasar" for "Kaşarlı Pide", "fistik" for "Fıstıklı Kadayıf Dolması". */
  const fillings = nameKeys.filter(isFillingWord).map(baseWord);
  const sweet = nameKeys.some((w) => SWEET_WORDS.has(w));
  // What the type never contains (a çiğ köfte's meat, a dessert's onion) and what is not food at all. A product
  // whose name is sweet never contains the savory list either, whatever its type (D-188).
  const neverWords = [...(type.forbiddenIngredients ?? []), ...(sweet ? SAVORY_INGREDIENTS : [])].map(wordsOf);
  const never = (name: string): boolean => {
    const words = wordsOf(name);
    return [...words].some((w) => NOT_FOOD.has(w)) || neverWords.some((forbiddenWords) => within(forbiddenWords, words));
  };
  /**
   * The name already made this choice (size groups never count): one of a single choice's answers is in the name
   * ("Penne Arrabbiata" / "Makarna Türü"), or the name carries a filling and the group picks the filling ("Kakaolu
   * Çörek" / "Çeşit: Peynirli, Zeytinli, Patatesli").
   */
  const nameDecides = (group: RawOptionGroup): boolean => {
    if (group.options.some((o) => o.priceMode === 'sets_base')) return false;
    if (group.selectionType === 'single' && group.options.some((o) => within(wordsOf(o.name), productWords))) return true;
    if (fillings.length === 0 || !VARIETY_GROUP.test(key(group.name))) return false;
    const answers = group.options.map((o) => key(o.name)).filter((k) => !NONE_OPTIONS.has(k) && k !== 'karisik');
    const filled = answers.filter((k) => isFillingWord(k.split(' ').pop() ?? ''));
    return filled.length >= 2 && filled.length * 2 >= answers.length;
  };
  /**
   * The ingredient the product is named after is not something to take out: "Kaşar" of a "Kaşarlı Pide", "Antep
   * Fıstığı" of a "Fıstıklı Kadayıf Dolması", "Soğan" of a "Soğan Halkası". "Pul Biber" of a "Biber Dolması" is
   * another thing, so a plain name word only counts for a one-word ingredient.
   */
  const namesProduct = (name: string): boolean => {
    const words = key(name).split(' ').filter(Boolean).map(baseWord);
    if (words.length === 1 && productWords.has(words[0]!)) return true;
    // Stems compared without their last letter: "fistik" / "fistigi", "tavuk" / "tavugu".
    return words.some((w) => fillings.some((f) => w === f || (f.length >= 4 && w.startsWith(f.slice(0, -1)) && w.length - f.length <= 2)));
  };

  // --- 1. separation -------------------------------------------------------------------------------------------
  const removable: string[] = [...suggestion.removable];
  const extras: string[] = [];
  const groups: RawOptionGroup[] = [];
  let moved = 0;
  let forbidden = 0;
  for (const group of suggestion.optionGroups) {
    const n = key(group.name);
    // A group the type can never have goes first, whole: a dessert's "Acı Seviyesi" is not an ingredient to keep.
    if (isForbiddenGroup(type, group.name)) {
      notes.push(`"${group.name}" çıkarıldı: ${type.label} ürününe uymaz`);
      forbidden += 1;
      continue;
    }
    if (REMOVABLE_GROUP.test(n) || INSIDE_GROUP.test(n)) {
      removable.push(...group.options.map((o) => asRemovable(o.name)));
      notes.push(`"${group.name}" çıkarılabilir malzemelere taşındı`);
      moved += 1;
      continue;
    }
    if (EXTRA_GROUP.test(n)) {
      extras.push(...group.options.map((o) => o.name));
      notes.push(`"${group.name}" ekstra malzemelere taşındı`);
      moved += 1;
      continue;
    }
    // "Ekstra Lavaş" inside a "Yanında" group is an extra, not a choice.
    const extraOptions = group.options.filter((o) => isExtraName(o.name));
    if (extraOptions.length > 0) {
      extras.push(...extraOptions.map((o) => o.name));
      moved += 1;
    }
    const options = group.options.filter((o) => !isExtraName(o.name));
    // "Soğan: Soğanlı / Soğansız", "Yumurta: Yumurtalı (+ücret) / Yumurtasız" — an ingredient toggle, not a choice.
    // Judged on what is left once the "Ekstra …" answers are out ("Yoğurt: Yoğurtlu / Yoğurtsuz / Ekstra Yoğurtlu").
    // Free both ways, the ingredient is in the product: a removable. Paid to have, it is an add-on: an extra.
    const without = options.filter((o) => isWithoutName(o.name));
    if (!PREFERENCE_GROUP.test(n) && without.length > 0 && without.length * 2 >= options.length) {
      const ingredients = without.map((o) => asRemovable(o.name));
      const paid = options.some((o) => !isWithoutName(o.name) && o.priceMode === 'surcharge');
      if (paid) extras.push(...ingredients);
      else removable.push(...ingredients);
      notes.push(`"${group.name}" bir malzeme aç/kapa seçimiydi, ${paid ? 'ekstra' : 'çıkarılabilir'} malzemelere taşındı`);
      moved += 1;
      continue;
    }
    groups.push({ ...group, options });
  }
  const removableOut: string[] = [];
  for (const item of removable) {
    if (isExtraName(item)) {
      extras.push(item);
      moved += 1;
    } else removableOut.push(asRemovable(item));
  }
  for (const item of suggestion.extras) {
    if (isWithoutName(item)) {
      removableOut.push(asRemovable(item));
      moved += 1;
    } else extras.push(item);
  }

  // --- 2. fit to the type --------------------------------------------------------------------------------------
  const fitting: RawOptionGroup[] = [];
  for (const group of groups) {
    if (rejected('option_group', group.name)) {
      notes.push(`"${group.name}" çıkarıldı: ekip bu tipte sürekli siliyor`);
      continue;
    }
    // The name already made this choice: "Somon Izgara" is not asked "Pişirme Şekli: Izgara / Fırında", "Penne
    // Arrabbiata" not "Makarna Türü: Spagetti / Penne", "Ispanaklı Börek" not "İç Harç: Peynirli / Ispanaklı".
    if (nameDecides(group)) {
      notes.push(`"${group.name}" çıkarıldı: ürünün adı bu seçimi zaten yapıyor`);
      forbidden += 1;
      continue;
    }
    const isBase = group.options.some((o) => o.priceMode === 'sets_base');
    const kept = group.options.filter((o) => !never(o.name) && (isBase || !within(wordsOf(o.name), productWords)));
    if (kept.length < group.options.length) forbidden += 1;
    fitting.push({ ...group, options: kept });
  }
  const productKey = key(options.productName);
  const namedAfter = removableOut.filter((i) => namesProduct(i));
  if (namedAfter.length > 0) notes.push(`${namedAfter.join(', ')} çıkarılabilirden çıkarıldı: ürün adını ondan alıyor`);
  let removableFinal = cleanIngredients(
    removableOut.filter((i) => key(i) !== productKey && !never(i) && !namesProduct(i) && !rejected('removable', i)),
  );
  let extrasFinal = cleanIngredients(extras.filter((i) => !never(i) && !rejected('extra', i)));
  // The same thing in both lists reads as a mistake; it is a removable (the customer takes it out).
  // The same thing as a removable AND an extra is the model saying "more of it": the extra is "Ekstra X".
  const removableKeys = new Set(removableFinal.map(key));
  extrasFinal = cleanIngredients(extrasFinal.map((i) => (removableKeys.has(key(i)) && !isExtraName(i) ? `Ekstra ${i}` : i)));

  // --- 3. shape --------------------------------------------------------------------------------------------------
  let { kept: groupsFinal } = validGroups(fitting);
  groupsFinal = groupsFinal.slice(0, MAX_GROUPS);
  // A "Dondurma" group AND a "Dondurma" extra ask the same question twice; the group (the choice) stays.
  const groupKeys = new Set(groupsFinal.map((g) => key(g.name)));
  extrasFinal = extrasFinal.filter((i) => !groupKeys.has(key(i)));

  // --- 4. completion from the type -------------------------------------------------------------------------------
  // A type guessed from the category or the cuisine (the name told nothing — "Browni", "Közlenmiş Sebze") is a weak
  // ground: only its size/portion choice is safe to add. Its sauces and ingredients belong to OTHER products of the
  // category (a brownie was offered ranch, garlic and parsley that way); the card stays thinner and says "Kontrol et".
  const completionGroups = options.byName ? type.optionGroups : type.optionGroups.filter((g) => g.options.some((o) => o.priceMode === 'sets_base'));
  if (options.want.options) {
    // Nothing usable proposed: the type's whole set. A single group: topped up to two — a card with one choice
    // rarely describes a real panel row ("opsiyonlar yetersiz").
    const target =
      groupsFinal.length === 0 ? completionGroups.length : Math.min(MIN_GROUPS, Math.max(groupsFinal.length, completionGroups.length));
    if (groupsFinal.length < target) {
      const have = new Set(groupsFinal.map((g) => key(g.name)));
      let hasBase = groupsFinal.some((g) => g.options.some((o) => o.priceMode === 'sets_base'));
      let added = 0;
      for (const group of completionGroups) {
        if (groupsFinal.length >= target) break;
        if (have.has(key(group.name)) || rejected('option_group', group.name) || nameDecides(group)) continue;
        const setsBase = group.options.some((o) => o.priceMode === 'sets_base');
        if (setsBase && hasBase) continue;
        hasBase = hasBase || setsBase;
        groupsFinal.push(group);
        have.add(key(group.name));
        added += 1;
      }
      if (added > 0) filled.push('options');
    }
  } else {
    groupsFinal = [];
  }
  // An answer in a group is not also an ingredient: "Yanında: Limon, Maydanoz" next to the removables "Limon,
  // Maydanoz" asks twice. The group is the choice, the ingredient leaves its list — before completion, so a list
  // emptied that way is filled from the type like any other (D-188).
  const answerKeys = new Set(groupsFinal.flatMap((g) => g.options.map((o) => key(o.name))));
  const answered = [...removableFinal, ...extrasFinal].filter((i) => answerKeys.has(key(i)));
  if (answered.length > 0) notes.push(`${answered.join(', ')} malzeme listesinden çıkarıldı: bir grupta zaten seçenek`);
  removableFinal = removableFinal.filter((i) => !answerKeys.has(key(i)));
  extrasFinal = extrasFinal.filter((i) => !answerKeys.has(key(i)));
  if (options.want.ingredients && options.byName) {
    if (removableFinal.length === 0) {
      removableFinal = cleanIngredients(
        type.removable.filter(
          (i) => key(i) !== productKey && !answerKeys.has(key(i)) && !never(i) && !namesProduct(i) && !rejected('removable', i),
        ),
      );
      if (removableFinal.length > 0) filled.push('removable');
    }
    if (extrasFinal.length === 0) {
      const taken = new Set(removableFinal.map(key));
      extrasFinal = cleanIngredients(
        type.extras.filter((i) => !taken.has(key(i)) && !answerKeys.has(key(i)) && !never(i) && !rejected('extra', i)),
      );
      if (extrasFinal.length > 0) filled.push('extras');
    }
  } else if (!options.want.ingredients) {
    removableFinal = [];
    extrasFinal = [];
  }

  // The last word on separation, after the knowledge base filled in: nothing is both taken out and added ("Ekstra
  // X" is the extra), and nothing is both a group and an extra (the group is the choice).
  const finalRemovable = new Set(removableFinal.map(key));
  const finalGroups = new Set(groupsFinal.map((g) => key(g.name)));
  extrasFinal = cleanIngredients(extrasFinal.map((i) => (finalRemovable.has(key(i)) && !isExtraName(i) ? `Ekstra ${i}` : i))).filter(
    (i) => !finalGroups.has(key(i)) && !finalRemovable.has(key(i)),
  );
  removableFinal = removableFinal.filter((i) => !finalGroups.has(key(i)));

  // What this team keeps taking for the type leads its list; the rest keep their order (D-194).
  const favoredFirst = (items: string[], kind: 'removable' | 'extra'): string[] => {
    if (!feedback) return items;
    const favored = items.filter((i) => feedback.isFavored(type.key, kind, i));
    return favored.length === 0 ? items : [...favored, ...items.filter((i) => !favored.includes(i))];
  };
  removableFinal = favoredFirst(removableFinal, 'removable');
  extrasFinal = favoredFirst(extrasFinal, 'extra');

  // --- 5. description --------------------------------------------------------------------------------------------
  let description = '';
  if (options.want.description) {
    // A category's stock sentence is no description of this product: the type's own one is better (D-222).
    const generic = isGenericDescription(suggestion.description, options.productName, options.alsoNamed);
    const own = generic ? null : acceptableDescription(suggestion.description);
    if (generic) notes.push('açıklama genel bir kalıptı, tipin açıklaması kullanıldı');
    if (own) description = own;
    else if (options.byName) {
      description = fitDescription(type.fallbackDescription) ?? '';
      if (description) filled.push('description');
      if (!generic && suggestion.description && countWords(suggestion.description) > 0) {
        notes.push(`açıklama uygun değildi (${countWords(suggestion.description)} kelime), tipin açıklaması kullanıldı`);
      }
    }
  }

  // --- confidence --------------------------------------------------------------------------------------------------
  const base = options.source === 'pool' ? 92 : options.source === 'model' ? 84 : 70;
  let confidence = base - (options.byName ? 0 : 12) - Math.min(18, forbidden * 6) - Math.min(9, moved * 3);
  if (options.source !== 'kb') confidence -= filled.length * 4;
  confidence = Math.max(35, Math.min(97, Math.round(confidence)));

  return { optionGroups: groupsFinal, removable: removableFinal, extras: extrasFinal, description, confidence, filled, notes };
}
