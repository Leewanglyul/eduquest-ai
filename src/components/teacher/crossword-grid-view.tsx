import { buildGrid, type ViewWord } from "@/features/crossword/review/view-model";

type Props = {
  rows: number;
  cols: number;
  words: readonly ViewWord[];
  /** Show the solution letters (teacher area only). Off = empty white cells, as a student would see them. */
  showSolution: boolean;
  /** Keys ("number-direction") of words to mark, for a warning. */
  highlightKeys?: readonly string[];
};

/**
 * Read-only preview of the board. Dark cells are empty; white cells belong to a word; small numbers mark where a
 * clue starts. Nothing depends on colour alone: filled cells have a border, numbers are text.
 */
export function CrosswordGridView({ rows, cols, words, showSolution, highlightKeys = [] }: Props) {
  const grid = buildGrid(rows, cols, words);
  const marked = new Set<string>();
  for (const w of words) {
    if (!highlightKeys.includes(`${w.number}-${w.direction}`)) continue;
    Array.from(w.answer).forEach((_, k) => {
      marked.add(
        `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`,
      );
    });
  }

  return (
    <div
      className="overflow-x-auto"
      role="group"
      aria-label={`낱말 퍼즐 미리보기 ${rows}행 ${cols}열`}
    >
      <table className="border-collapse" aria-label="퍼즐 칸">
        <tbody>
          {grid.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                if (!cell.filled) {
                  return (
                    <td
                      key={c}
                      className="h-9 w-9 border border-slate-700 bg-slate-800"
                      aria-hidden="true"
                    />
                  );
                }
                const isMarked = marked.has(`${r},${c}`);
                return (
                  <td
                    key={c}
                    className={`relative h-9 w-9 border border-slate-500 bg-white text-center align-middle text-base ${
                      isMarked ? "outline outline-2 -outline-offset-2 outline-amber-500" : ""
                    }`}
                  >
                    {cell.number !== null ? (
                      <span className="absolute left-0.5 top-0 text-[10px] leading-none text-slate-600">
                        {cell.number}
                      </span>
                    ) : null}
                    {showSolution ? (
                      <span className="font-semibold">{cell.char}</span>
                    ) : (
                      <span className="sr-only">빈 칸</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
