import type { CrosswordPuzzle, PlacedWord } from "./types";

/**
 * Plain-text view of a puzzle for tests, logs and documentation. Each cell is three columns wide (Hangul
 * syllables are wide). With `solution` a cell shows its letter followed by its number, if it has one; without it
 * only the number (or a dot). Empty cells are ■.
 */
export function renderGrid(puzzle: CrosswordPuzzle, options: { solution?: boolean } = {}): string {
  const solution = options.solution ?? true;
  const letters = new Map<string, string>();
  const numbers = new Map<string, number>();
  for (const w of puzzle.words) {
    numbers.set(`${w.row},${w.col}`, w.number);
    if (w.single) continue; // a one-cell word sits on a cell that a longer word already fills
    Array.from(w.answer).forEach((ch, k) => {
      letters.set(`${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`, ch);
    });
  }

  const lines: string[] = [];
  for (let r = 0; r < puzzle.rows; r += 1) {
    let line = "";
    for (let c = 0; c < puzzle.cols; c += 1) {
      const key = `${r},${c}`;
      const letter = letters.get(key);
      const number = numbers.get(key);
      if (letter === undefined) line += " ■ ";
      else if (solution) line += `${letter}${number ?? ""}`.padEnd(3, " ");
      else line += (number === undefined ? "·" : String(number)).padEnd(3, " ");
    }
    lines.push(line.trimEnd());
  }
  return lines.join("\n");
}

export function renderClues(puzzle: CrosswordPuzzle): string {
  const section = (title: string, words: PlacedWord[]) =>
    [title, ...words.map((w) => `  ${w.number}. ${w.clue} (${Array.from(w.answer).length})`)].join("\n");
  const sorted = (direction: PlacedWord["direction"]) =>
    puzzle.words.filter((w) => w.direction === direction).sort((a, b) => a.number - b.number);
  return [section("가로 (Across)", sorted("across")), section("세로 (Down)", sorted("down"))].join("\n");
}
