/** What the site reads from the API; backend/src/modules/{analyze,chat}/schemas.ts are the source of truth. */

export type Section = 'new_product' | 'option' | 'fix';

export interface OptionGroup {
  name: string;
  selectionType: 'single' | 'multi';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: { name: string; priceMode: 'free' | 'surcharge' | 'sets_base' }[];
}

export interface Card {
  id: string;
  runId: string;
  section: Section;
  name: string;
  targetName: string | null;
  categoryLabel: string | null;
  source: 'seed' | 'db' | 'ai' | 'review';
  shortDescription: string;
  portionInfo: string;
  priceRangeHint: string;
  reason: string;
  optionGroups: OptionGroup[];
  removableIngredients: string[];
  extraIngredients: string[];
  fixKind: 'empty_description' | 'bad_name' | 'wrong_category' | null;
  currentValue: string | null;
  suggestedValue: string | null;
  basedOn: string | null;
  pitch: string;
}

export interface CategoryCount {
  key: string;
  label: string;
  present: number;
  minItems: number;
  missing: number;
}

export interface ShareRule {
  present: number;
  known: number;
  total: number;
  share: number;
  ok: boolean | null;
}

/** The opening checklist (D-206); `ok: null` means the input could not show it. */
export interface Quality {
  products: { current: number; target: number; ok: boolean };
  drinks: { current: number; target: number; ok: boolean };
  descriptions: ShareRule;
  images: ShareRule;
  writing: { names: string[]; checked: number; ok: boolean | null };
  extraCuisines: { name: string; count: number }[];
}

export interface Counts {
  current: number;
  target: number;
  missing: number;
  cuisineName: string;
  categories: CategoryCount[];
  quality?: Quality;
}

export interface RunResult {
  runId: string;
  status: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  counts: Counts | null;
  menu: { name: string; categoryLabel: string }[];
  cards: Card[];
  warnings: { code: string; message: string }[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageCount: number;
  runId: string | null;
  quickReplies: string[];
  createdAt: string;
  result: RunResult | null;
  /** This session's object URLs: images never leave for the server's storage, so a reload shows only the count. */
  previews?: string[];
}

export interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Conversation extends ConversationRow {
  messages: Message[];
}

export type ChatEvent =
  | { type: 'conversation'; conversation: ConversationRow }
  | { type: 'user_message'; message: Message }
  | { type: 'message'; message: Message }
  | { type: 'run'; runId: string }
  | { type: 'progress'; agent: string; message: string; done?: number; total?: number }
  | { type: 'classification'; classification: { cuisineName: string } }
  | { type: 'menu'; items: unknown[] }
  | { type: 'counts'; counts: Counts }
  | { type: 'item'; card: Card }
  | { type: 'warning'; code: string; message: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string }
  | { type: 'trace' };
