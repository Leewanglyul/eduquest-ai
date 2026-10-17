import type { Direction } from "./types";

export type GridWord = {
  entryId: string;
  chars: string[];
  row: number;
  col: number;
  direction: Direction;
  single: boolean;
};

export type Placement = { row: number; col: number; direction: Direction };

const NONE = -1;

/**
 * The board the placer works on: a square area, large enough that a puzzle can grow in any direction from the
 * centre, with for every cell its character and which word (across, down) uses it. A one-cell word takes the
 * free slot of its cell, so a cell is "full" when both slots are taken.
 */
export class WorkGrid {
  readonly n: number;
  readonly words: GridWord[] = [];
  private readonly ch: (string | null)[];
  private readonly across: number[];
  private readonly down: number[];
  private minR = Infinity;
  private maxR = -Infinity;
  private minC = Infinity;
  private maxC = -Infinity;

  constructor(gridSize: number) {
    this.n = gridSize * 2 + 1;
    this.ch = new Array(this.n * this.n).fill(null);
    this.across = new Array(this.n * this.n).fill(NONE);
    this.down = new Array(this.n * this.n).fill(NONE);
  }

  private idx(r: number, c: number) {
    return r * this.n + c;
  }
  private inside(r: number, c: number) {
    return r >= 0 && c >= 0 && r < this.n && c < this.n;
  }
  private filled(r: number, c: number) {
    return this.inside(r, c) && this.ch[this.idx(r, c)] !== null;
  }
  private slots(direction: Direction) {
    return direction === "across" ? this.across : this.down;
  }

  get isEmpty() {
    return this.words.length === 0;
  }

  /** Bounding box (rows, cols) of everything placed so far, or of the board if nothing is placed. */
  get box() {
    return this.isEmpty ? { rows: 0, cols: 0 } : { rows: this.maxR - this.minR + 1, cols: this.maxC - this.minC + 1 };
  }

  get bounds() {
    return { minR: this.minR, maxR: this.maxR, minC: this.minC, maxC: this.maxC };
  }

  cellChar(r: number, c: number): string | null {
    return this.inside(r, c) ? this.ch[this.idx(r, c)] : null;
  }

  /**
   * Can this word go here? Rules of docs/m2/04-crossword-generator.md §2.3:
   * inside the board and inside the grid size; both ends clear; every new cell has clear sides; every shared cell
   * has the same character and is not already used by a word of the same direction; and (unless it is the first
   * word) the word crosses at least one existing cell.
   */
  check(chars: readonly string[], placement: Placement, gridSize: number): { ok: false } | { ok: true; crossings: number } {
    const { row, col, direction } = placement;
    const dr = direction === "down" ? 1 : 0;
    const dc = direction === "across" ? 1 : 0;
    const len = chars.length;
    const endR = row + (len - 1) * dr;
    const endC = col + (len - 1) * dc;
    if (row < 0 || col < 0 || endR >= this.n || endC >= this.n) return { ok: false };

    const minR = Math.min(this.minR, row);
    const maxR = Math.max(this.maxR, endR);
    const minC = Math.min(this.minC, col);
    const maxC = Math.max(this.maxC, endC);
    if (maxR - minR + 1 > gridSize || maxC - minC + 1 > gridSize) return { ok: false };

    if (this.filled(row - dr, col - dc) || this.filled(endR + dr, endC + dc)) return { ok: false };

    const slots = this.slots(direction);
    let crossings = 0;
    for (let k = 0; k < len; k += 1) {
      const r = row + k * dr;
      const c = col + k * dc;
      const i = this.idx(r, c);
      if (this.ch[i] !== null) {
        if (this.ch[i] !== chars[k]) return { ok: false };
        if (slots[i] !== NONE) return { ok: false };
        crossings += 1;
      } else if (this.filled(r + dc, c + dr) || this.filled(r - dc, c - dr)) {
        return { ok: false };
      }
    }
    if (!this.isEmpty && crossings === 0) return { ok: false };
    return { ok: true, crossings };
  }

  /** Every legal position of a multi-cell word that crosses an existing word. */
  candidates(chars: readonly string[], gridSize: number): { placement: Placement; crossings: number }[] {
    const found = new Map<string, { placement: Placement; crossings: number }>();
    for (const placed of this.words) {
      if (placed.single) continue;
      const direction: Direction = placed.direction === "across" ? "down" : "across";
      for (let j = 0; j < placed.chars.length; j += 1) {
        const pr = placed.row + (placed.direction === "down" ? j : 0);
        const pc = placed.col + (placed.direction === "across" ? j : 0);
        for (let i = 0; i < chars.length; i += 1) {
          if (chars[i] !== placed.chars[j]) continue;
          const placement: Placement =
            direction === "down" ? { row: pr - i, col: pc, direction } : { row: pr, col: pc - i, direction };
          const key = `${placement.row},${placement.col},${direction}`;
          if (found.has(key)) continue;
          const result = this.check(chars, placement, gridSize);
          if (result.ok) found.set(key, { placement, crossings: result.crossings });
        }
      }
    }
    return [...found.values()];
  }

  place(word: Omit<GridWord, "row" | "col" | "direction"> & Placement) {
    const dr = word.direction === "down" ? 1 : 0;
    const dc = word.direction === "across" ? 1 : 0;
    const index = this.words.length;
    const slots = this.slots(word.direction);
    word.chars.forEach((c, k) => {
      const r = word.row + k * dr;
      const col = word.col + k * dc;
      this.ch[this.idx(r, col)] = c;
      slots[this.idx(r, col)] = index;
      this.minR = Math.min(this.minR, r);
      this.maxR = Math.max(this.maxR, r);
      this.minC = Math.min(this.minC, col);
      this.maxC = Math.max(this.maxC, col);
    });
    this.words.push({ ...word });
  }

  /**
   * Cells where a one-character word can sit: same character, used by exactly one word, and with a clear
   * neighbourhood in the free direction. The word takes the direction the cell's word does not use.
   */
  singleCandidates(ch: string): Placement[] {
    const out: Placement[] = [];
    for (let r = 0; r < this.n; r += 1) {
      for (let c = 0; c < this.n; c += 1) {
        const i = this.idx(r, c);
        if (this.ch[i] !== ch) continue;
        const hasAcross = this.across[i] !== NONE;
        const hasDown = this.down[i] !== NONE;
        if (hasAcross === hasDown) continue; // unused (impossible) or already a crossing
        const direction: Direction = hasAcross ? "down" : "across";
        const dr = direction === "down" ? 1 : 0;
        const dc = direction === "across" ? 1 : 0;
        if (this.filled(r - dr, c - dc) || this.filled(r + dr, c + dc)) continue;
        out.push({ row: r, col: c, direction });
      }
    }
    return out;
  }

  placeSingle(entryId: string, ch: string, placement: Placement) {
    const i = this.idx(placement.row, placement.col);
    this.slots(placement.direction)[i] = this.words.length;
    this.words.push({ entryId, chars: [ch], ...placement, single: true });
  }

  /** Cells shared by two multi-cell words. */
  countCrossings(): number {
    let n = 0;
    for (let i = 0; i < this.ch.length; i += 1) {
      if (this.across[i] !== NONE && this.down[i] !== NONE && !this.words[this.across[i]].single && !this.words[this.down[i]].single) n += 1;
    }
    return n;
  }
}
