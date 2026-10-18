/**
 * The crossword grid, drawn from structure plus the student's own letters. It never needs the key. Presentational: the
 * board passes `onSelectCell`; the result page passes nothing and gets a read-only grid.
 *
 * Accessibility: role="grid" with real rows; every cell has a name such as "가로 1번, 2글자, 첫 번째 칸, 입력됨, 사"; the
 * selected cell and word are told apart by a thick border and a tint (not colour alone); checked cells carry ✓ / ✗ marks.
 */
import type { CSSProperties } from "react";
import { cellAccessibleName } from "@/features/crossword/play/a11y";
import { cellKey, wordCells, wordForSelection, wordsAt, type Selection } from "@/features/crossword/play/cells";
import type { CellState, CheckStatus, PlayWord } from "@/features/crossword/play/types";

type Props = {
  label: string;
  rows: number;
  cols: number;
  words: readonly PlayWord[];
  /** The student's typed letters. */
  cells: Readonly<Record<string, string>>;
  /** Letters the student was given (prefilled or revealed). */
  given: Readonly<Record<string, string>>;
  /** Pending (not yet committed) letters of a composition in progress. */
  pending?: Readonly<Record<string, string>>;
  /** Client-only check results; cleared when a cell is edited. */
  marks?: Readonly<Record<string, CheckStatus>>;
  selection?: Selection | null;
  onSelectCell?: (key: string) => void;
};

const MARK_ICON: Record<CheckStatus, string> = { ok: "✓", wrong: "✗", empty: "·" };

export function PlayGrid({ label, rows, cols, words, cells, given, pending = {}, marks = {}, selection = null, onSelectCell }: Props) {
  const used = new Set(words.flatMap((w) => wordCells(w)));
  const starts = new Map<string, number>();
  for (const w of words) {
    const k = wordCells(w)[0];
    if (!starts.has(k)) starts.set(k, w.number);
  }
  const selectedWord = selection ? wordForSelection(words, selection) : null;
  const selectedKeys = new Set(selectedWord ? wordCells(selectedWord) : []);

  const rowIndexes = Array.from({ length: rows }, (_, r) => r).filter((r) => Array.from({ length: cols }, (_, c) => cellKey(r, c)).some((k) => used.has(k)));

  return (
    <div
      role="grid"
      aria-label={label}
      aria-rowcount={rowIndexes.length}
      aria-colcount={cols}
      className="play-grid inline-block rounded border border-slate-400 bg-slate-200 p-1"
      style={{ "--cols": cols } as CSSProperties}
    >
      {rowIndexes.map((r) => (
        <div key={r} role="row" className="flex">
          {Array.from({ length: cols }, (_, c) => {
            const key = cellKey(r, c);
            if (!used.has(key)) {
              return <div key={key} aria-hidden="true" style={{ width: "var(--cell)", height: "var(--cell)" }} />;
            }
            const letter = pending[key] ?? cells[key] ?? given[key] ?? "";
            const state: CellState = pending[key] ? "pending" : given[key] ? "given" : cells[key] ? "typed" : "empty";
            const through = wordsAt([...words], key);
            const named = selectedWord && selectedKeys.has(key) ? selectedWord : through[0];
            const index = wordCells(named).indexOf(key);
            const mark = marks[key];
            const isSelected = selection?.key === key;
            const inWord = selectedKeys.has(key);
            const name = cellAccessibleName({ word: named, index: Math.max(0, index), state, mark, letter: letter || undefined });
            const border = isSelected ? "border-[3px] border-blue-700" : inWord ? "border-2 border-slate-500" : "border border-slate-500";
            const fill = state === "pending" ? "bg-amber-50" : state === "given" ? "bg-slate-100" : inWord ? "bg-blue-50" : "bg-white";
            const look = `${border} ${fill} ${state === "pending" ? "underline decoration-2 underline-offset-4" : ""} ${state === "given" ? "font-bold text-slate-800" : "text-slate-900"}`;
            return (
              <div
                key={key}
                role="gridcell"
                aria-selected={isSelected}
                aria-label={name}
                tabIndex={-1}
                onPointerDown={
                  onSelectCell
                    ? (e) => {
                        e.preventDefault(); // keep focus (and any composition) in the one input
                        onSelectCell(key);
                      }
                    : undefined
                }
                data-cell={key}
                data-state={state}
                className={`relative m-px flex select-none items-center justify-center ${look}`}
                style={{ width: "calc(var(--cell) - 2px)", height: "calc(var(--cell) - 2px)", fontSize: "calc(var(--cell) * 0.5)" }}
              >
                {starts.has(key) ? (
                  <span aria-hidden="true" className="absolute left-0.5 top-0 text-[10px] font-medium leading-none text-slate-700">
                    {starts.get(key)}
                  </span>
                ) : null}
                <span aria-hidden="true">{letter}</span>
                {mark ? (
                  <span aria-hidden="true" className="absolute bottom-0 right-0.5 text-[11px] font-bold leading-none text-slate-800">
                    {MARK_ICON[mark]}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
