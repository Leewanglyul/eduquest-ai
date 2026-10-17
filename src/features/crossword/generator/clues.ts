import { MASK_CHAR } from "./constants";

const upperAscii = (value: string) => value.replace(/[a-z]/g, (c) => c.toUpperCase());

/**
 * A clue must not contain its answer. Every occurrence of the answer in the clue is replaced by one ○ per cell
 * (docs/m2/04-crossword-generator.md §3.3). Matching ignores ASCII case and keeps the case of the rest of the
 * clue. Answers of one character are left alone: they occur inside almost any clue and masking them would ruin
 * the text. Returns the clue and whether anything was masked.
 */
export function maskClue(clue: string, answer: string): { clue: string; masked: boolean } {
  const cells = Array.from(answer).length;
  if (cells < 2) return { clue, masked: false };

  const text = clue.normalize("NFC");
  const upper = upperAscii(text); // ASCII-only change: same length as `text`, so indexes line up
  const needle = upperAscii(answer.normalize("NFC"));
  if (!upper.includes(needle)) return { clue, masked: false };

  let out = "";
  let i = 0;
  while (i < text.length) {
    if (upper.startsWith(needle, i)) {
      out += MASK_CHAR.repeat(cells);
      i += needle.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return { clue: out, masked: true };
}
