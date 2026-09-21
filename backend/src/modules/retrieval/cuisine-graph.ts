import type { Executor } from '../../db/client.js';
import { cuisines } from '../../db/schema/index.js';

export interface CuisineNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  minItemCount: number;
}

/**
 * Cuisine proximity used to prefer templates of the same cuisine: 0 = same, 1 = parent/child,
 * 2 = sibling (same parent), 3 = unrelated.
 */
export class CuisineGraph {
  private readonly byId: Map<string, CuisineNode>;

  constructor(nodes: readonly CuisineNode[]) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
  }

  static async load(db: Executor): Promise<CuisineGraph> {
    const rows = await db
      .select({
        id: cuisines.id,
        name: cuisines.name,
        slug: cuisines.slug,
        parentId: cuisines.parentId,
        minItemCount: cuisines.minItemCount,
      })
      .from(cuisines);
    return new CuisineGraph(rows);
  }

  /** Every cuisine, in insertion order — the Classifier picks from this list. */
  get all(): readonly CuisineNode[] {
    return [...this.byId.values()];
  }

  get(id: string): CuisineNode | undefined {
    return this.byId.get(id);
  }

  rank(targetId: string, candidateId: string): number {
    if (targetId === candidateId) return 0;
    const target = this.byId.get(targetId);
    const candidate = this.byId.get(candidateId);
    if (!target || !candidate) return 3;
    if (target.parentId === candidate.id || candidate.parentId === target.id) return 1;
    if (target.parentId !== null && target.parentId === candidate.parentId) return 2;
    return 3;
  }

  /** Ids with rank ≤ maxRank, e.g. same cuisine + parent/children + siblings. */
  related(targetId: string, maxRank = 2): string[] {
    return [...this.byId.keys()].filter((id) => this.rank(targetId, id) <= maxRank);
  }
}
