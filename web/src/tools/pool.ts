import { post } from '../api';

/**
 * Description ideas from the approved pool (D-220): the server matches product names the way the analysis does, without a
 * model. The rep reads an idea before using it; a bulk fill takes only the close ones.
 */
export interface DescriptionIdea {
  /** The approved template's name. */
  name: string;
  description: string;
  /** 1 for the same name or a known alias, otherwise how alike the names are (0.5–1). */
  score: number;
}

/** The analysis's own threshold for "the same product" (retrieval's trigram hit): what a bulk fill takes without asking. */
export const SURE_SCORE = 0.72;
const CHUNK = 500;

export async function describeNames(names: readonly string[]): Promise<DescriptionIdea[][]> {
  const found: DescriptionIdea[][] = [];
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK).map((name) => name.trim().slice(0, 200));
    const body = await post<{ items: { ideas: DescriptionIdea[] }[] }>('/tools/describe', { names: chunk });
    found.push(...body.items.map((item) => item.ideas));
  }
  return found;
}
