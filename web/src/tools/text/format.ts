import { BASE_LEXICON, type Lexicon } from './lexicon';
import { fold, hasTurkishLetters, numberSuffix, plainCapitalize, suffixKind, trCapitalize, trLower } from './turkish';

/**
 * The panel's writing rules as code (D-218): a pasted product name, store name or description comes back as the panel
 * wants it, instantly and without a model.
 *
 * Names: every word capitalised ("ve", "ile", "veya" stay small), a quantity in parentheses with its unit small — "(330 ml)"
 * — and a count or a portion capitalised — "(2 Adet)", "(Porsiyon)"; a number's suffix in harmony with how it is read
 * ("6'lı", "2'şer"); symbols spaced, no full stop. Descriptions: sentence case, proper names kept, a full stop at the end.
 * With `smart` on, the lexicon also restores Turkish letters, fixes clear misspellings and splits run-together words.
 */

export type TextKind = 'name' | 'description';

export interface FormatOptions {
  kind: TextKind;
  smart: boolean;
  lexicon?: Lexicon;
}

type Token =
  | { type: 'word'; text: string; space: boolean; foreign?: boolean }
  | { type: 'num'; text: string; space: boolean }
  | { type: 'quant'; amount: string; unit: Unit; space: boolean }
  | { type: 'nsuf'; text: string; space: boolean }
  | { type: 'punct'; text: string; space: boolean; spacedAfter?: boolean };

interface Unit {
  /** How the unit is written: a symbol stays small, a word ("Adet") is capitalised in a name. */
  text: string;
  word: boolean;
}

const SYMBOL_UNITS: Readonly<Record<string, string>> = {
  g: 'gr',
  gr: 'gr',
  grm: 'gr',
  gram: 'gr',
  kg: 'kg',
  kgr: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  ml: 'ml',
  mlt: 'ml',
  mili: 'ml',
  mililitre: 'ml',
  mililiter: 'ml',
  cl: 'cl',
  l: 'lt',
  lt: 'lt',
  ltr: 'lt',
  litre: 'lt',
  liter: 'lt',
};
const WORD_UNITS: Readonly<Record<string, string>> = {
  adet: 'adet',
  ad: 'adet',
  adt: 'adet',
  porsiyon: 'porsiyon',
  porsion: 'porsiyon',
  porsyon: 'porsiyon',
  prs: 'porsiyon',
  dilim: 'dilim',
  kisilik: 'kişilik',
  parca: 'parça',
};
/** Words that size a portion written without a number: "Yarım Porsiyon". */
const PORTION_SIZES = new Set(['yarim', 'tam', 'ceyrek', 'duble', 'buyuk', 'kucuk', 'orta']);
/** Kept in capitals wherever they stand. */
const ACRONYMS = new Set(['xs', 'xl', 'xxl', 'xxxl', 'bbq', 'vip', 'tl', 'kdv', 'diy', 'pet']);
/** Brands written as two words that are one hyphenated name. */
const HYPHENATED: readonly (readonly [string, string])[] = [['coca', 'cola']];
/** Proper names a description keeps capitalised: places, peoples, brands of the menu. */
const PROPER: ReadonlyMap<string, string> = new Map(
  [
    'Adana', 'Antep', 'Gaziantep', 'Urfa', 'Şanlıurfa', 'İskender', 'Bursa', 'Kayseri', 'Trabzon', 'Karadeniz', 'Ege', 'Akdeniz',
    'Anadolu', 'Türk', 'Türkiye', 'Osmanlı', 'İtalyan', 'İtalya', 'Meksika', 'Amerikan', 'Hint', 'Çin', 'Japon', 'Fransız', 'Yunan',
    'Arap', 'Lübnan', 'Belçika', 'İsviçre', 'Konya', 'Maraş', 'Hatay', 'Antakya', 'Diyarbakır', 'Erzurum', 'Van', 'İzmir',
    'İstanbul', 'Ankara', 'Bolu', 'Ezine', 'Kars', 'Afyon', 'Sivas', 'Malatya', 'Mersin', 'Tarsus', 'Bafra', 'Akçaabat', 'İnegöl',
    'Tekirdağ', 'Edirne', 'Halep', 'Arnavut', 'Napoli', 'Coca-Cola', 'Pepsi', 'Fanta', 'Sprite', 'Nutella', 'Lotus', 'Oreo',
  ].map((name) => [fold(name), name]),
);

/**
 * A plain-letter word the lexicon does not know looks foreign when it has letters or pairs Turkish does not write —
 * "Chicken", "Wings", "Cookie", "Tea" — and is then capitalised with a plain I. Anything else is taken for Turkish: "iyi"
 * is "İyi".
 */
const looksForeign = (word: string): boolean => /[qwx]|ch|sh|th|ck|ph|oo|ee|ea|ou|y$/u.test(word.toLowerCase());

const isLetterWord = (token: Token | undefined): token is Extract<Token, { type: 'word' }> => token?.type === 'word';
/** The punctuation mark a token is, or undefined for a word or a number. */
const markOf = (token: Token | undefined): string | undefined => (token?.type === 'punct' ? token.text : undefined);

/** "0.5" → "0,5" (a Turkish decimal comma); "1.000" stays a thousands group. */
function decimal(number: string): string {
  return number.replace(/(\d)\.(\d{1,2})(?!\d)/gu, '$1,$2');
}

function clean(line: string): string {
  return line
    .normalize('NFC')
    .replace(/[​-‍﻿]/gu, '')
    .replace(/[’‘`´]/gu, "'")
    .replace(/[“”«»]/gu, '"')
    .replace(/\s*[–—−]\s*/gu, ' - ')
    .replace(/[\t ]/gu, ' ')
    .replace(/^\s*(?:[•·▪◦●*]+|-(?=\s))\s*/u, '')
    .trim();
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let space = false;
  for (const match of line.matchAll(/(\d+(?:[.,]\d+)*)|([\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)*)|(\s+)|(.)/gu)) {
    const [, num, word, blank, other] = match;
    if (blank) {
      space = true;
      continue;
    }
    if (num) tokens.push({ type: 'num', text: num, space });
    else if (word) tokens.push({ type: 'word', text: word, space });
    else if (other) tokens.push({ type: 'punct', text: other, space });
    space = false;
  }
  // A punctuation mark spaced after it in the source (for the hyphen of "Waffle - Urfa").
  tokens.forEach((token, i) => {
    if (token.type === 'punct') token.spacedAfter = tokens[i + 1]?.space ?? false;
  });
  return tokens;
}

/** "6 li", "10LU", "3 Er", "6'Lİ" → one token "6'lı", "10'lu", "3'er". */
function mergeSuffixes(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.type === 'num' && /^\d+$/u.test(token.text)) {
      const apostrophe = markOf(tokens[i + 1]) === "'" ? 1 : 0;
      const next = tokens[i + 1 + apostrophe];
      // A suffix is three letters at most, glued to the number, after an apostrophe or one space away.
      const kind = isLetterWord(next) && [...next.text].length <= 3 ? suffixKind(next.text) : undefined;
      if (kind) {
        out.push({ type: 'nsuf', text: `${token.text}'${numberSuffix(token.text, kind)}`, space: token.space });
        i += 1 + apostrophe;
        continue;
      }
    }
    out.push(token);
  }
  return out;
}

/** "330ML", "1.5 L", "2 ad" → one quantity token "330 ml", "1,5 lt", "2 adet". */
function mergeQuantities(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    if (token.type === 'num' && isLetterWord(next)) {
      const key = fold(next.text);
      const symbol = SYMBOL_UNITS[key];
      const word = WORD_UNITS[key];
      // A following letter would make "l" the start of a word ("1 Lahmacun" has no litre in it): whole words only.
      if (symbol || word) {
        out.push({ type: 'quant', amount: decimal(token.text), unit: symbol ? { text: symbol, word: false } : { text: word!, word: true }, space: token.space });
        i += 1;
        continue;
      }
    }
    out.push(token);
  }
  return out;
}

/** Restores Turkish letters, fixes a clear misspelling, splits a run-together word — or leaves the word as typed. */
function fixWords(tokens: Token[], options: FormatOptions): Token[] {
  const lexicon = options.lexicon ?? BASE_LEXICON;
  const out: Token[] = [];
  for (const token of tokens) {
    if (!isLetterWord(token)) {
      out.push(token);
      continue;
    }
    const raw = token.text;
    // A word with an apostrophe ("Ali'nin") or a capitalised abbreviation is someone's name or a size: as typed.
    if (raw.includes("'") || ACRONYMS.has(fold(raw))) {
      out.push({ ...token, text: trLower(raw) });
      continue;
    }
    const turkishTyped = hasTurkishLetters(raw);
    const key = fold(raw);
    if (!options.smart) {
      // Without the lexicon an ASCII word is lowered the plain way: "ICED" is "iced", not "ıced".
      out.push({ ...token, text: turkishTyped ? trLower(raw) : raw.toLowerCase(), foreign: !turkishTyped && looksForeign(raw) });
      continue;
    }
    const known = lexicon.spelling(key);
    if (known) {
      out.push({ ...token, text: known, foreign: lexicon.isForeign(key) });
      continue;
    }
    const parts = lexicon.split(key);
    if (parts) {
      parts.forEach((part, index) => out.push({ type: 'word', text: lexicon.spelling(part)!, space: index === 0 ? token.space : true }));
      continue;
    }
    const corrected = lexicon.correction(key);
    if (corrected) {
      out.push({ ...token, text: lexicon.spelling(corrected)!, foreign: lexicon.isForeign(corrected) });
      continue;
    }
    // Unknown: a word typed in Turkish letters is Turkish; one in plain letters is foreign only if it looks it ("Chicken").
    out.push({ ...token, text: turkishTyped ? trLower(raw) : raw.toLowerCase(), foreign: !turkishTyped && looksForeign(raw) });
  }
  return out;
}

/** "coca cola" → "Coca-Cola": a brand's two words joined by its hyphen. */
function joinBrands(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    if (isLetterWord(token) && isLetterWord(next) && HYPHENATED.some(([a, b]) => fold(token.text) === a && fold(next.text) === b)) {
      out.push(token, { type: 'punct', text: '-', space: false, spacedAfter: false }, { ...next, space: false });
      i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

/** "1 kg Baklava" → "Baklava (1 kg)": in a name the quantity follows what it measures. */
function quantityLast(tokens: Token[]): Token[] {
  const first = tokens[0];
  if (first?.type !== 'quant' || !tokens.slice(1).some(isLetterWord)) return tokens;
  const rest = tokens.slice(1);
  return [{ ...rest[0]!, space: false }, ...rest.slice(1), { ...first, space: true }];
}

/** A name's trailing portion with no number — "Urfa Porsiyon", "İskender Yarım Porsiyon" — goes into parentheses. */
function wrapTrailingPortion(tokens: Token[]): Token[] {
  const last = tokens.at(-1);
  if (!isLetterWord(last) || WORD_UNITS[fold(last.text)] !== 'porsiyon') return tokens;
  let depth = 0;
  for (const token of tokens.slice(0, -1)) if (token.type === 'punct') depth += token.text === '(' ? 1 : token.text === ')' ? -1 : 0;
  if (depth > 0) return tokens;
  const before = tokens.at(-2);
  const start = isLetterWord(before) && PORTION_SIZES.has(fold(before.text)) ? tokens.length - 2 : tokens.length - 1;
  if (start === 0) return tokens;
  const words = tokens.slice(start) as Extract<Token, { type: 'word' }>[];
  return [
    ...tokens.slice(0, start),
    { type: 'punct', text: '(', space: true, spacedAfter: false },
    ...words.map((word, index) => ({ ...word, space: index > 0, foreign: false })),
    { type: 'punct', text: ')', space: false, spacedAfter: false },
  ];
}

function caseWord(token: Extract<Token, { type: 'word' }>, kind: TextKind, sentenceStart: boolean): string {
  const key = fold(token.text);
  if (ACRONYMS.has(key)) return token.text.toLocaleUpperCase('en');
  const capital = (text: string) => (token.foreign ? plainCapitalize(text) : trCapitalize(text));
  if (kind === 'name') {
    // Every word starts with a capital, "ve" and "ile" too: the team's rule (D-219).
    if ([...token.text].length === 1) return token.text.toLocaleUpperCase('en');
    return capital(token.text);
  }
  const proper = PROPER.get(key);
  if (proper) return proper;
  return sentenceStart ? capital(token.text) : token.text;
}

function unitText(unit: Unit, kind: TextKind): string {
  return unit.word && kind === 'name' ? trCapitalize(unit.text) : unit.text;
}

const OPENING = new Set(['(', '[']);
const CLOSING = new Set([')', ']']);
const TRAILING = new Set([',', ';', ':', '!', '?', '.']);
const SPACED = new Set(['/', '+', '&']);
const SENTENCE_END = new Set(['.', '!', '?']);

function render(tokens: Token[], kind: TextKind): string {
  let out = '';
  let depth = 0;
  let sentenceStart = true;
  // A run of the same mark ("!!", ",,") is one.
  const deduped = tokens.filter((token, i) => !(token.type === 'punct' && TRAILING.has(token.text) && token.text !== '.' && markOf(tokens[i - 1]) === token.text));
  deduped.forEach((token, i) => {
    const prev = deduped[i - 1];
    const next = deduped[i + 1];
    const prevText = prev?.type === 'punct' ? prev.text : undefined;
    const tightSymbol = (symbol: Token | undefined, before: Token | undefined, after: Token | undefined): boolean =>
      // "/", "+" and "&" are always spaced, a fraction too ("1 / 2", the team's rule, D-219); a hyphen only if it came spaced.
      symbol?.type === 'punct' && symbol.text === '-' && !symbol.space && !symbol.spacedAfter && before !== undefined && after !== undefined;

    if (token.type === 'punct') {
      const mark = token.text;
      if (TRAILING.has(mark)) {
        // A decimal or a time inside numbers is part of them ("12:30").
        out = out.trimEnd() + mark;
        if (SENTENCE_END.has(mark)) sentenceStart = true;
        return;
      }
      if (OPENING.has(mark)) {
        if (out.length > 0 && !/[([\s]$/u.test(out)) out += ' ';
        out += mark;
        depth += 1;
        return;
      }
      if (CLOSING.has(mark)) {
        out = out.trimEnd() + mark;
        depth = Math.max(0, depth - 1);
        return;
      }
      if (SPACED.has(mark) || mark === '-') {
        if (tightSymbol(token, prev, next)) out = out.trimEnd() + mark;
        else out = `${out.trimEnd()} ${mark}`;
        return;
      }
      // Quotes and other signs keep the spacing they came with.
      out += (token.space && out.length > 0 ? ' ' : '') + mark;
      return;
    }

    // A value token: a space before it unless it opens the line, follows an opening bracket or a tight symbol.
    const glued = out.length === 0 || /[([]$/u.test(out) || (prev?.type === 'punct' && tightSymbol(prev, deduped[i - 2], token)) || (prevText === "'" && !token.space) || (prevText === '"' && !token.space);
    if (!glued) out += ' ';

    if (token.type === 'word') {
      out += caseWord(token, kind, sentenceStart);
    } else if (token.type === 'quant') {
      const value = `${token.amount} ${unitText(token.unit, kind)}`;
      out += kind === 'name' && depth === 0 ? `(${value})` : value;
    } else {
      out += token.text;
    }
    sentenceStart = false;
  });

  out = out.replace(/\s+/gu, ' ').trim();
  // A name keeps the punctuation it was typed with ("Elma, Armut."); only stray leading marks go.
  if (kind === 'name') return out.replace(/^[\s.,;:]+/u, '');
  out = out.replace(/^[\s.,;:]+/u, '');
  return out.length > 0 && !/[.!?…]$/u.test(out) ? `${out}.` : out;
}

/** One line fixed by the rules of its kind. */
export function formatLine(line: string, options: FormatOptions): string {
  const cleaned = clean(line);
  if (cleaned.length === 0) return '';
  let tokens = mergeQuantities(mergeSuffixes(tokenize(cleaned)));
  tokens = fixWords(tokens, options);
  // A run-together "330ml" split by the lexicon pass would not be one: quantities are merged again after it.
  tokens = mergeQuantities(tokens);
  tokens = joinBrands(tokens);
  if (options.kind === 'name') tokens = wrapTrailingPortion(quantityLast(tokens));
  return render(tokens, options.kind);
}

export interface FormattedText {
  text: string;
  lines: { before: string; after: string }[];
  /** Lines that came out different. */
  changed: number;
}

/** Every line fixed by itself; empty lines kept, so a pasted column comes back row for row. */
export function formatText(text: string, options: FormatOptions): FormattedText {
  const lines = text.split(/\r?\n/u).map((before) => ({ before, after: before.trim() === '' ? '' : formatLine(before, options) }));
  return { text: lines.map((l) => l.after).join('\n'), lines, changed: lines.filter((l) => l.after !== l.before).length };
}

