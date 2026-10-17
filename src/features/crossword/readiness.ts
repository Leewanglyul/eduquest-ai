import { analyseAnswer } from "./generator/chars";
import { maskClue } from "./generator/clues";
import { CROSSWORD_MAX_GRID, CROSSWORD_MIN_WORDS } from "./generator/constants";
import { generateCrossword } from "./generator/generate";
import type { CrosswordInputEntry, ExclusionReason } from "./generator/types";

/**
 * Crossword readiness of a word set (docs/m2/05-m2-2-2-teacher-review-plan.md §6, decision C5).
 *
 * Pure and deterministic: it looks at the live entries of one set *before* the teacher generates anything and says
 * whether the set can make a crossword and what to improve. It uses the generator's own eligibility filter and a
 * fixed probe run, so "not ready" is exactly "the generator would refuse" (decision C2: at least 5 placed words).
 * The result contains the teacher's answers in its messages: it is for the teacher area only.
 */

/** Approved thresholds and weights (plan §6.2). */
export const READINESS = {
  /** Placed words (and eligible words) at which the matching score part is full. */
  fullAt: 12,
  weightProbe: 0.5,
  weightConnected: 0.25,
  weightEligible: 0.25,
  /** Score from which a set is "ready", provided the probe places at least `CROSSWORD_MIN_WORDS` words. */
  readyScore: 70,
  /** The fixed probe: seed, attempts and grid. Changing any of them changes every score. */
  probeSeed: 0,
  probeAttempts: 30,
  probeGrid: CROSSWORD_MAX_GRID,
  /** How many words a message lists before it says "and N more". */
  listLimit: 5,
} as const;

export type ReadinessBand = "blocked" | "needs_work" | "ready";

export const READINESS_LABELS: Record<ReadinessBand, string> = {
  blocked: "만들기 어려움",
  needs_work: "보완 필요",
  ready: "준비됨",
};

export type ReadinessMessageCode =
  | "NO_ELIGIBLE_WORDS"
  | "TOO_FEW_WORDS"
  | "PROBE_TOO_SMALL"
  | "ISOLATED_WORDS"
  | "SMALL_CONNECTED_GROUP"
  | "EXCLUDED_WORDS"
  | "CLUE_CONTAINS_ANSWER"
  | "READY";

export type ReadinessMessage = {
  code: ReadinessMessageCode;
  severity: "info" | "warning" | "blocking";
  /** Korean text for the teacher. */
  text: string;
  /** Entry ids the message is about (all of them, even when the text lists only the first few). */
  entryIds: string[];
};

export type ReadinessMeasures = {
  /** Multi-cell words that pass the generator's eligibility filter (E). */
  eligible: number;
  /** Eligible one-character words (clues on cells of other words; they never connect anything). */
  singles: number;
  /** Entries left out, by reason. */
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Size of the largest group of eligible words connected through shared characters (L). */
  largestGroup: number;
  /** Eligible words that share a character with no other eligible word. */
  isolated: number;
  /** Multi-cell words the fixed probe run places (P). */
  probePlaced: number;
  /** Eligible words whose clue contains the answer (it would be masked as ○ in the puzzle). */
  clueLeaks: number;
};

export type ReadinessResult = {
  /** 0..100 */
  score: number;
  band: ReadinessBand;
  label: string;
  measures: ReadinessMeasures;
  /** Word connectivity: groups of eligible entry ids joined by shared characters, largest first, ids sorted. */
  groups: string[][];
  isolatedIds: string[];
  messages: ReadinessMessage[];
};

/** Connected groups of words that share at least one character (union-find over characters). */
export function connectivityGroups(
  words: readonly { id: string; chars: readonly string[] }[],
): string[][] {
  const parent = new Map<string, string>(words.map((w) => [w.id, w.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const owner = new Map<string, string>(); // character -> first word id that has it
  for (const w of words) {
    for (const ch of new Set(w.chars)) {
      const first = owner.get(ch);
      if (first === undefined) owner.set(ch, w.id);
      else parent.set(find(w.id), find(first));
    }
  }
  const groups = new Map<string, string[]>();
  for (const w of words) {
    const root = find(w.id);
    groups.set(root, [...(groups.get(root) ?? []), w.id]);
  }
  return [...groups.values()]
    .map((g) => g.sort())
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
}

const REASON_TEXT: Record<ExclusionReason, (n: number) => string> = {
  INVALID_CHARACTERS: (n) =>
    `${n}개 단어는 정답으로 쓸 수 없습니다 (이모지·기호·공백 등). 글자와 숫자로만 된 정답으로 고쳐 주세요.`,
  EMPTY_ANSWER: (n) => `${n}개 단어는 정답이 비어 있어 쓸 수 없습니다.`,
  TOO_LONG: (n) =>
    `${n}개 단어는 퍼즐 칸보다 길어서 쓸 수 없습니다 (최대 ${CROSSWORD_MAX_GRID}글자).`,
  TOO_SHORT: (n) => `${n}개 단어는 너무 짧아서 쓸 수 없습니다.`,
  DUPLICATE_ANSWER: (n) => `${n}개 단어는 같은 정답이 이미 있어서 쓸 수 없습니다.`,
  SCRIPT_NOT_ALLOWED: (n) => `${n}개 단어는 선택한 글자 종류에 맞지 않아 쓸 수 없습니다.`,
  EXCLUDED_BY_TEACHER: (n) => `${n}개 단어를 직접 제외했습니다.`,
};

const list = (names: string[]) =>
  names.length <= READINESS.listLimit
    ? names.join(", ")
    : `${names.slice(0, READINESS.listLimit).join(", ")} 외 ${names.length - READINESS.listLimit}개`;

export function computeReadiness(entries: readonly CrosswordInputEntry[]): ReadinessResult {
  // The probe: the generator's own filter and a fixed, cheap placement run.
  const probe = generateCrossword(entries, {
    seed: READINESS.probeSeed,
    gridSize: READINESS.probeGrid,
    minWords: 1,
    maxAttempts: READINESS.probeAttempts,
  });
  const probePlaced = probe.ok ? probe.stats.words : probe.placedWords;

  const excludedIds = new Set(probe.excluded.map((e) => e.entryId));
  const excluded: ReadinessMeasures["excluded"] = {};
  for (const e of probe.excluded) excluded[e.reason] = (excluded[e.reason] ?? 0) + 1;

  const multi: { id: string; chars: string[]; answer: string; clue: string }[] = [];
  let singles = 0;
  for (const entry of [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (excludedIds.has(entry.id)) continue;
    const analysis = analyseAnswer(entry.answer);
    if (!analysis.ok) continue; // cannot happen: the generator excluded it
    if (analysis.chars.length === 1) singles += 1;
    else
      multi.push({
        id: entry.id,
        chars: analysis.chars,
        answer: analysis.answer,
        clue: entry.clue,
      });
  }

  const eligible = multi.length;
  const answerOf = new Map(multi.map((w) => [w.id, w.answer]));
  const groups = connectivityGroups(multi);
  const largestGroup = groups[0]?.length ?? 0;
  const isolatedIds = groups
    .filter((g) => g.length === 1)
    .map((g) => g[0])
    .sort();
  const leakIds = multi.filter((w) => maskClue(w.clue, w.answer).masked).map((w) => w.id);

  const full = READINESS.fullAt;
  const raw =
    eligible === 0
      ? 0
      : 100 *
        (READINESS.weightProbe * Math.min(1, probePlaced / full) +
          READINESS.weightConnected * (largestGroup / eligible) +
          READINESS.weightEligible * Math.min(1, eligible / full));
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // The gate is the same rule as decision C2: a set the generator would refuse is never "ready".
  const band: ReadinessBand =
    probePlaced < CROSSWORD_MIN_WORDS
      ? "blocked"
      : score >= READINESS.readyScore
        ? "ready"
        : "needs_work";

  const messages: ReadinessMessage[] = [];
  if (eligible === 0) {
    messages.push({
      code: "NO_ELIGIBLE_WORDS",
      severity: "blocking",
      entryIds: [],
      text: "퍼즐에 쓸 수 있는 단어가 없습니다. 단어를 추가하거나 정답을 고쳐 주세요.",
    });
  } else if (eligible < CROSSWORD_MIN_WORDS) {
    messages.push({
      code: "TOO_FEW_WORDS",
      severity: "blocking",
      entryIds: multi.map((w) => w.id),
      text: `쓸 수 있는 단어가 ${eligible}개뿐입니다. 서로 겹치는 단어가 ${CROSSWORD_MIN_WORDS}개 이상 필요합니다.`,
    });
  } else if (probePlaced < CROSSWORD_MIN_WORDS) {
    messages.push({
      code: "PROBE_TOO_SMALL",
      severity: "blocking",
      entryIds: [],
      text: `이 단어들로 만든 시험 퍼즐에는 ${probePlaced}개만 들어갑니다. ${CROSSWORD_MIN_WORDS}개 이상이 필요하니, 같은 글자가 들어간 단어를 더 추가해 보세요.`,
    });
  }
  if (isolatedIds.length > 0 && eligible > 1) {
    messages.push({
      code: "ISOLATED_WORDS",
      severity: "warning",
      entryIds: isolatedIds,
      text: `다른 단어와 겹치는 글자가 없는 단어가 ${isolatedIds.length}개 있습니다: ${list(isolatedIds.map((id) => answerOf.get(id) as string))}`,
    });
  }
  if (eligible > 1 && largestGroup < eligible) {
    messages.push({
      code: "SMALL_CONNECTED_GROUP",
      severity: "warning",
      entryIds: groups[0] ?? [],
      text: `서로 이어지는 단어가 가장 많은 묶음이 ${largestGroup}개뿐입니다. 같은 글자가 들어간 단어를 더 추가해 보세요.`,
    });
  }
  for (const reason of Object.keys(excluded) as ExclusionReason[]) {
    messages.push({
      code: "EXCLUDED_WORDS",
      severity: "warning",
      entryIds: probe.excluded
        .filter((e) => e.reason === reason)
        .map((e) => e.entryId)
        .sort(),
      text: REASON_TEXT[reason](excluded[reason] as number),
    });
  }
  if (leakIds.length > 0) {
    messages.push({
      code: "CLUE_CONTAINS_ANSWER",
      severity: "info",
      entryIds: leakIds,
      text: `뜻에 정답이 그대로 들어 있는 단어가 ${leakIds.length}개 있습니다 (퍼즐에서는 ○로 가려집니다): ${list(leakIds.map((id) => answerOf.get(id) as string))}`,
    });
  }
  if (band === "ready") {
    messages.push({
      code: "READY",
      severity: "info",
      entryIds: [],
      text: "이 단어 모음으로 낱말 퍼즐을 만들 수 있습니다.",
    });
  }

  return {
    score,
    band,
    label: READINESS_LABELS[band],
    measures: {
      eligible,
      singles,
      excluded,
      largestGroup,
      isolated: isolatedIds.length,
      probePlaced,
      clueLeaks: leakIds.length,
    },
    groups,
    isolatedIds,
    messages,
  };
}
