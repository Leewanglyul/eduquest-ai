/**
 * Across / Down clue lists. Real lists; every clue is a button that selects that word (so a student who cannot or does
 * not want to tap the grid can still move around), and the current clue is marked with aria-current and a heavier look.
 */
import type { PlayWord } from "@/features/crossword/play/types";

type Props = {
  words: readonly PlayWord[];
  current: PlayWord | null;
  /** 초성 hints already shown, keyed "<number><direction>". */
  chosung?: Readonly<Record<string, string>>;
  onSelectWord?: (word: PlayWord) => void;
};

function List({ title, words, current, chosung, onSelectWord }: Props & { title: string }) {
  const id = `clues-${title}`;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="mb-1 text-base font-semibold">
        {title}
      </h2>
      <ol className="space-y-1">
        {words.map((w) => {
          const isCurrent = current?.number === w.number && current?.direction === w.direction;
          const hint = chosung?.[`${w.number}${w.direction}`];
          return (
            <li key={`${w.number}${w.direction}`}>
              <button
                type="button"
                onClick={onSelectWord ? () => onSelectWord(w) : undefined}
                aria-current={isCurrent ? "true" : undefined}
                className={`flex min-h-11 w-full items-start gap-2 rounded px-2 py-2 text-left text-sm ${
                  isCurrent ? "border-l-4 border-blue-700 bg-blue-50 font-semibold" : "border-l-4 border-transparent hover:bg-slate-100"
                }`}
              >
                <span className="w-6 shrink-0 text-right tabular-nums">{w.number}.</span>
                <span className="min-w-0 flex-1">
                  {w.clue} <span className="whitespace-nowrap text-slate-700">({w.length}글자)</span>
                  {hint ? <span className="ml-1 whitespace-nowrap">· 초성 {hint}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function PlayClues({ words, current, chosung, onSelectWord }: Props) {
  const across = words.filter((w) => w.direction === "across");
  const down = words.filter((w) => w.direction === "down");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <List title="가로" words={across} current={current} chosung={chosung} onSelectWord={onSelectWord} />
      <List title="세로" words={down} current={current} chosung={chosung} onSelectWord={onSelectWord} />
    </div>
  );
}
