import type { CategoryGap } from '../domain/category.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { isRejectedTally, type Tally } from './knowledge.js';

/**
 * The call (D-196). The expert reads the result screen while talking to the seller and has to create the need: say
 * what to add, in what order, and why. Every card carries one sentence to say out loud — the "neden" — and a
 * priority that decides the order of the call. Both are built from facts only: the menu's own gaps, how common the
 * product is in this cuisine's curated pool, and what sellers actually answered on earlier calls. No statistic is
 * made up; a fact that is not there is simply not said.
 */

export interface Pitch {
  /** One sentence to say to the seller; '' when there is nothing solid to say. */
  text: string;
  /** Higher first. */
  priority: number;
}

/** Enough earlier answers for a seller statistic to be worth saying out loud. */
const MIN_ANSWERS = 3;

const lowerTr = (text: string): string => text.toLocaleLowerCase('tr-TR');
/** "Aynı harçla…" → "aynı harçla…", but "Adana…" stays: only a plain first word is lowered. */
const lowerFirst = (text: string): string => {
  const [first = '', ...rest] = text.split(' ');
  return /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/u.test(first) && rest.length > 0 && !/^[A-ZÇĞİÖŞÜ]/u.test(rest[0] ?? '')
    ? [lowerTr(first), ...rest].join(' ')
    : text;
};

/** "menünüzde hiç tatlı yok; …" → "Menünüzde hiç tatlı yok; …." */
function sentence(parts: readonly string[]): string {
  const text = parts.filter((p) => p.length > 0).slice(0, 2).join('; ');
  if (!text) return '';
  return `${text.charAt(0).toLocaleUpperCase('tr-TR')}${text.slice(1)}.`;
}

export interface NewProductPitchInput {
  categoryKey: string;
  categoryLabel: string | null;
  gaps: readonly CategoryGap[];
  cuisineName: string;
  /** The pool's 0–100 importance of the template; 0 for a product the model proposed. */
  importance: number;
  /** A packaged drink: a plain panel row. */
  plain: boolean;
  /** What sellers of this cuisine answered about this product before ("Evet" / "Hayır"). */
  answers: Tally | undefined;
  /** D-198: the menu product this one is an alternative of; null for a category product. */
  basedOn?: string | null;
  /** The recommender's one-line reason; said after the alternative, when there is room. */
  reason?: string;
  /** How many products the menu has; on a tiny one an empty category is no news (D-213). */
  menuSize?: number;
  /** The product is of a type the menu (or what the rep named) already sells, or of its kind: fish and seafood to a hamsi seller. */
  sameKind?: boolean;
  /** It carries the own word of the product it is built on: "Hamsili Pilav" of "Hamsi Tava". */
  variant?: boolean;
}

/**
 * D-213. A menu of one to three products — a typed "hamsi", "Adana, Lahmacun" — lacks every category, so "menünüzde hiç
 * çorba yok" ranks nothing. There the call goes: the variants of what it sells, then more of its kind (other fish and
 * seafood), then the other alternatives, then the rest of the cuisine. The bands sit further apart than the importance
 * bonus (≤ 10), so Ayran waits its turn.
 */
const TINY_MENU = 3;
const TINY_BANDS = { variant: 115, sameKind: 100, alternative: 85, other: 70 } as const;

/**
 * A product to add. First what the menu lacks (a category with nothing in it opens the call), then what sellers of
 * this kitchen keep saying yes to; a product they keep turning down goes to the end — never away (another seller may
 * want it).
 */
export function newProductPitch(input: NewProductPitchInput): Pitch {
  const parts: string[] = [];
  let priority = 50;
  const gap = input.gaps.find((g) => g.key === input.categoryKey);
  const label = input.categoryLabel ?? gap?.label ?? '';
  if (gap && label && gap.present === 0 && gap.missing > 0) {
    parts.push(`menünüzde hiç ${lowerTr(label)} yok`);
    priority = 100;
  } else if (gap && label && gap.missing > 0) {
    parts.push(`${lowerTr(label)} tarafınız az (${gap.present}/${gap.minItems})`);
    priority = 80;
  }

  // An alternative is the strongest "neden" after an empty category: the seller already makes its base (D-198).
  if (input.basedOn) {
    parts.push(`${input.basedOn} ürününüzün alternatifi`);
    const why = (input.reason ?? '').trim().replace(/[.!]+$/u, '');
    if (why) parts.push(lowerFirst(why));
    priority = Math.max(priority, 85);
  }
  if (input.menuSize !== undefined && input.menuSize <= TINY_MENU) {
    priority = input.variant
      ? TINY_BANDS.variant
      : input.sameKind
        ? TINY_BANDS.sameKind
        : input.basedOn
          ? TINY_BANDS.alternative
          : TINY_BANDS.other;
  }

  const answered = input.answers ? input.answers.accepted + input.answers.removed : 0;
  if (input.answers && answered >= MIN_ANSWERS) {
    if (isRejectedTally(input.answers)) priority -= 40;
    else if (input.answers.accepted * 2 >= answered) {
      parts.push(`son ${answered} satıcıdan ${input.answers.accepted} tanesi ekledi`);
      priority += 10;
    }
  }

  if (input.importance >= 70) parts.push(`${input.cuisineName} menülerinin çoğunda var`);
  else if (input.importance >= 50) parts.push(`${input.cuisineName} menülerinde sık görülür`);
  if (input.plain && parts.length === 0) parts.push('hazır içecek, eklemesi kolay');
  priority += Math.round(Math.max(0, Math.min(100, input.importance)) / 10);

  return { text: sentence(parts), priority };
}

export interface MenuProductPitchInput {
  optionGroups: readonly { name: string; options: readonly { name: string; priceMode: string }[] }[];
  removableIngredients: readonly string[];
  extraIngredients: readonly string[];
  description: string;
  /** The panel showed this product with no options at all. */
  hadNoOptions: boolean;
}

/**
 * A product the seller already sells: the strongest thing the card adds is what gets said — a menu or a drink
 * choice grows the basket, a size choice sells at more than one price, an extra is extra revenue.
 */
export function menuProductPitch(input: MenuProductPitchInput): Pitch {
  const groups = input.optionGroups;
  // Compared normalized: a case-insensitive /içecek/ does not match the capital "İ" of "İçecek Seçimi".
  const menu = groups.find((g) => /(^| )menu/u.test(normalizeTr(g.name)) && g.options.some((o) => o.priceMode === 'surcharge'));
  const drink = groups.find((g) => /icecek/u.test(normalizeTr(g.name)));
  const size = groups.find((g) => g.options.some((o) => o.priceMode === 'sets_base'));
  const other = groups.find((g) => g !== menu && g !== drink && g !== size);
  const bonus = input.hadNoOptions ? 10 : 0;
  if (menu) return { text: sentence(['menü seçeneği (patates, içecek) sepeti büyütür']), priority: 70 + bonus };
  if (drink) return { text: sentence(['içecek seçeneği sepeti büyütür']), priority: 65 + bonus };
  if (size) return { text: sentence([`${lowerTr(size.name)} seçeneğiyle farklı fiyatlardan satılır`]), priority: 60 + bonus };
  if (input.extraIngredients.length > 0) {
    return { text: sentence([`${input.extraIngredients[0]} gibi ekstralar ek gelir getirir`]), priority: 50 + bonus };
  }
  if (other) return { text: sentence([`${lowerTr(other.name)} seçimi müşterinin işini kolaylaştırır`]), priority: 40 + bonus };
  if (input.removableIngredients.length > 0) {
    return { text: sentence(['müşteri istemediği malzemeyi çıkarabilir']), priority: 30 + bonus };
  }
  if (input.description.trim()) return { text: sentence(['kısa açıklama müşterinin karar vermesini kolaylaştırır']), priority: 20 };
  return { text: '', priority: 0 };
}
