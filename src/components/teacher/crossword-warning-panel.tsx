import type { ExcludedEntry, UnplacedEntry } from "@/features/crossword/generator/types";
import {
  EXCLUSION_LABEL,
  UNPLACED_LABEL,
  type ReviewWarning,
} from "@/features/crossword/review/view-model";

type Props = {
  warnings: ReviewWarning[];
  /** Only a fresh preview knows these. */
  excluded?: ExcludedEntry[];
  unplaced?: UnplacedEntry[];
  /** Entry id -> answer, to name the words left out. */
  entryAnswers?: Record<string, string>;
};

/** Review warnings (masked clues, duplicate clues, weak crossings) and the words that did not make it, with reasons. */
export function CrosswordWarningPanel({
  warnings,
  excluded = [],
  unplaced = [],
  entryAnswers = {},
}: Props) {
  if (warnings.length === 0 && excluded.length === 0 && unplaced.length === 0) {
    return (
      <p role="status" className="text-sm text-slate-600">
        확인이 필요한 경고가 없습니다.
      </p>
    );
  }
  const name = (id: string) => entryAnswers[id] ?? "(알 수 없음)";
  return (
    <section
      aria-labelledby="warnings-title"
      className="space-y-3 rounded-md border border-amber-600 p-4"
    >
      <h2 id="warnings-title" className="text-base font-semibold text-amber-800">
        확인할 점
      </h2>
      {warnings.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {warnings.map((w) => (
            <li key={w.code}>{w.text}</li>
          ))}
        </ul>
      ) : null}
      {unplaced.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">퍼즐에 들어가지 못한 단어</h3>
          <ul className="list-disc pl-5 text-sm">
            {unplaced.map((u) => (
              <li key={u.entryId}>
                {name(u.entryId)} — {UNPLACED_LABEL[u.reason]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {excluded.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">쓸 수 없어 제외한 단어</h3>
          <ul className="list-disc pl-5 text-sm">
            {excluded.map((e) => (
              <li key={e.entryId}>
                {name(e.entryId)} — {EXCLUSION_LABEL[e.reason]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
