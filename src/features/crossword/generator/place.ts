import { WorkGrid, type Placement } from "./grid";
import type { ResolvedOptions } from "./options";
import type { Rng } from "./prng";
import { shuffled } from "./prng";
import type { Candidate } from "./select";

export type AttemptResult = {
  grid: WorkGrid;
  /** Entry ids of the multi-cell and one-cell words that were placed. */
  placed: Set<string>;
};

const TOP_CHOICES = 3;

/** How many of the other words share at least one character with this one. */
function partnerCount(word: Candidate, pool: readonly Candidate[]): number {
  const mine = new Set(word.chars);
  return pool.filter((o) => o !== word && o.chars.some((c) => mine.has(c))).length;
}

/**
 * One greedy attempt (docs/m2/04-crossword-generator.md §2.1): the longest word goes in the middle, then the
 * remaining words are tried in a seeded order; each takes the best-scoring legal position that crosses what is
 * already there. Passes repeat while any word can still be placed. One-character words are added last, each on
 * a free-direction cell with the same character.
 */
export function runAttempt(multi: readonly Candidate[], singles: readonly Candidate[], options: ResolvedOptions, rng: Rng, attempt: number): AttemptResult {
  const grid = new WorkGrid(options.gridSize);
  const placed = new Set<string>();
  if (multi.length === 0) return { grid, placed };

  // Words that share characters with many others make the best skeleton, so they are tried first. The first
  // attempts each start from a different word (attempt k starts from the k-th best); later attempts mix the
  // order with the seeded generator.
  const partners = new Map(multi.map((w) => [w.entryId, partnerCount(w, multi)]));
  const base = (w: Candidate) => 2 * (partners.get(w.entryId) as number) + w.chars.length;
  const ranked = [...multi].sort((a, b) => base(b) - base(a) || b.chars.length - a.chars.length);

  let first: Candidate;
  let rest: Candidate[];
  if (attempt < ranked.length) {
    first = ranked[attempt];
    rest = ranked.filter((w) => w !== first);
  } else {
    const keyed = [...multi].map((w) => ({ w, key: base(w) + rng.next() * 6 })).sort((a, b) => b.key - a.key).map((x) => x.w);
    [first, ...rest] = keyed;
  }
  if (attempt >= ranked.length || attempt > 0) {
    rest = rest.map((w) => ({ w, key: base(w) + rng.next() * 4 })).sort((a, b) => b.key - a.key).map((x) => x.w);
  }

  const centre = options.gridSize; // the middle row of the working board
  grid.place({
    entryId: first.entryId,
    chars: first.chars,
    single: false,
    row: centre,
    col: Math.max(0, centre - Math.floor(first.chars.length / 2)),
    direction: "across",
  });
  placed.add(first.entryId);

  let pending = rest;
  while (pending.length > 0) {
    const stillPending: Candidate[] = [];
    let progress = false;
    for (const word of pending) {
      const choice = chooseBest(grid, word, options, rng);
      if (choice === null) {
        stillPending.push(word);
        continue;
      }
      grid.place({ entryId: word.entryId, chars: word.chars, single: false, ...choice });
      placed.add(word.entryId);
      progress = true;
    }
    if (!progress) break;
    pending = stillPending;
  }

  for (const word of shuffled(singles, rng)) {
    const options_ = grid.singleCandidates(word.chars[0]);
    if (options_.length === 0) continue;
    const pick = options_[rng.nextInt(options_.length)];
    grid.placeSingle(word.entryId, word.chars[0], pick);
    placed.add(word.entryId);
  }

  return { grid, placed };
}

/** Best of the legal positions, picked among the top few with the seeded generator so restarts differ. */
function chooseBest(grid: WorkGrid, word: Candidate, options: ResolvedOptions, rng: Rng): Placement | null {
  const candidates = grid.candidates(word.chars, options.gridSize);
  if (candidates.length === 0) return null;

  const before = grid.box;
  const beforeArea = before.rows * before.cols;
  const acrossCount = grid.words.filter((w) => !w.single && w.direction === "across").length;
  const downCount = grid.words.filter((w) => !w.single && w.direction === "down").length;
  const centre = options.gridSize;

  const scored = candidates.map(({ placement, crossings }) => {
    const bounds = grid.bounds;
    const len = word.chars.length;
    const endR = placement.row + (placement.direction === "down" ? len - 1 : 0);
    const endC = placement.col + (placement.direction === "across" ? len - 1 : 0);
    const rows = Math.max(bounds.maxR, endR) - Math.min(bounds.minR, placement.row) + 1;
    const cols = Math.max(bounds.maxC, endC) - Math.min(bounds.minC, placement.col) + 1;
    const growth = rows * cols - beforeArea;
    const midR = (placement.row + endR) / 2;
    const midC = (placement.col + endC) / 2;
    const distance = Math.abs(midR - centre) + Math.abs(midC - centre);
    const balance = (placement.direction === "across" ? downCount - acrossCount : acrossCount - downCount) > 0 ? 1 : 0;
    const score = 3 * crossings - 2 * growth - distance + balance + rng.next();
    return { placement, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.placement.row - b.placement.row ||
      a.placement.col - b.placement.col ||
      a.placement.direction.localeCompare(b.placement.direction),
  );
  return scored[rng.nextInt(Math.min(TOP_CHOICES, scored.length))].placement;
}
