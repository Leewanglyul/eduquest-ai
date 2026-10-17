import { analyseAnswer } from "./chars";
import type { ResolvedOptions } from "./options";
import type { Rng } from "./prng";
import { shuffled } from "./prng";
import type { CrosswordInputEntry, ExcludedEntry, UnplacedEntry } from "./types";

export type Candidate = { entryId: string; answer: string; chars: string[]; clue: string };

export type Selection = {
  /** Words of two or more cells, the skeleton of the puzzle. */
  multi: Candidate[];
  /** One-character words (decision C1): clues on cells of other words. */
  singles: Candidate[];
  excluded: ExcludedEntry[];
  /** Eligible words that did not fit under the word limits. */
  notSelected: UnplacedEntry[];
};

const byId = (a: CrosswordInputEntry, b: CrosswordInputEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Number of other words in the pool that share at least one character with this one. */
function partnerCount(word: Candidate, pool: Candidate[]): number {
  const mine = new Set(word.chars);
  return pool.filter((other) => other !== word && other.chars.some((c) => mine.has(c))).length;
}

/**
 * Decides which entries can be used and which of them go into the puzzle.
 *
 * The input is sorted by id first, so the result does not depend on the order the database returned the rows.
 * Every entry that is left out gets a reason the teacher can read: the answer is empty, it has characters that
 * are not Hangul, Latin letters or digits (emoji, symbols, spaces; decision C7), its script is switched off, it
 * is shorter or longer than allowed, it repeats another answer, or the teacher excluded it.
 */
export function selectWords(entries: readonly CrosswordInputEntry[], options: ResolvedOptions, rng: Rng): Selection {
  const excluded: ExcludedEntry[] = [];
  const seen = new Set<string>();
  const multiPool: Candidate[] = [];
  const singlePool: Candidate[] = [];

  for (const entry of [...entries].sort(byId)) {
    if (options.excludedIds.has(entry.id)) {
      excluded.push({ entryId: entry.id, reason: "EXCLUDED_BY_TEACHER" });
      continue;
    }
    const analysis = analyseAnswer(entry.answer);
    if (!analysis.ok) {
      excluded.push({
        entryId: entry.id,
        reason: analysis.reason,
        ...(analysis.reason === "INVALID_CHARACTERS" ? { detail: analysis.bad.join(" ") } : {}),
      });
      continue;
    }
    const notAllowed = [...analysis.scripts].filter((s) => !options.scripts.has(s));
    if (notAllowed.length > 0) {
      excluded.push({ entryId: entry.id, reason: "SCRIPT_NOT_ALLOWED", detail: notAllowed.join(",") });
      continue;
    }
    const length = analysis.chars.length;
    if (length < options.minWordLen) {
      excluded.push({ entryId: entry.id, reason: "TOO_SHORT" });
      continue;
    }
    if (length > options.maxWordLen) {
      excluded.push({ entryId: entry.id, reason: "TOO_LONG" });
      continue;
    }
    if (seen.has(analysis.answer)) {
      excluded.push({ entryId: entry.id, reason: "DUPLICATE_ANSWER" });
      continue;
    }
    seen.add(analysis.answer);

    const candidate: Candidate = { entryId: entry.id, answer: analysis.answer, chars: analysis.chars, clue: entry.clue };
    (length === 1 ? singlePool : multiPool).push(candidate);
  }

  const notSelected: UnplacedEntry[] = [];

  // Multi-cell words. When there are more than the puzzle can hold, grow a connected selection: start from the
  // pinned words (or the word with the most partners), then keep adding the word that shares characters with the
  // most words already chosen, so the subset can actually be crossed. Words with no link come last.
  let multi = multiPool;
  if (multiPool.length > options.maxWords) {
    const order = shuffled(multiPool, rng); // seeded tie-break
    const chosen: Candidate[] = order.filter((w) => options.pinnedIds.has(w.entryId)).slice(0, options.maxWords);
    const remaining = order.filter((w) => !chosen.includes(w));
    const links = (w: Candidate) => chosen.filter((c) => c.chars.some((ch) => w.chars.includes(ch))).length;
    while (chosen.length < options.maxWords && remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = -1;
      remaining.forEach((w, i) => {
        const score = (chosen.length === 0 ? 0 : links(w)) * 1000 + partnerCount(w, multiPool) * 10 + w.chars.length;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      });
      chosen.push(remaining.splice(bestIndex, 1)[0]);
    }
    multi = chosen;
    for (const w of remaining) notSelected.push({ entryId: w.entryId, reason: "NOT_SELECTED" });
  }

  // One-cell words: pinned first, then the rest in a seeded order, up to the limit.
  const orderedSingles = [
    ...singlePool.filter((w) => options.pinnedIds.has(w.entryId)),
    ...shuffled(singlePool.filter((w) => !options.pinnedIds.has(w.entryId)), rng),
  ];
  const singles = orderedSingles.slice(0, options.maxSingleWords);
  for (const w of orderedSingles.slice(options.maxSingleWords)) notSelected.push({ entryId: w.entryId, reason: "NOT_SELECTED" });

  return { multi, singles, excluded, notSelected };
}
