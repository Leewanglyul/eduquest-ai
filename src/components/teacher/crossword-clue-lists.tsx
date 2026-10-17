import { DIRECTION_LABEL, splitClues, type ViewWord } from "@/features/crossword/review/view-model";

type Props = { words: readonly ViewWord[] };

/** Across (가로) and Down (세로) clues in number order, each with its length: `1. 힌트 (2)`. Real lists for screen readers. */
export function CrosswordClueLists({ words }: Props) {
  const { across, down } = splitClues(words);
  const section = (direction: "across" | "down", lines: typeof across) => (
    <section aria-labelledby={`clues-${direction}`}>
      <h3 id={`clues-${direction}`} className="mb-1 text-sm font-semibold">
        {DIRECTION_LABEL[direction]} ({direction === "across" ? "Across" : "Down"})
      </h3>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-600">없음</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.key}>
              <span className="mr-1 font-medium">{l.number}.</span>
              {l.clue} <span className="text-slate-600">({l.length})</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {section("across", across)}
      {section("down", down)}
    </div>
  );
}
