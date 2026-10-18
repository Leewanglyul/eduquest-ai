/**
 * The result screen's view model (doc 08 D). The order of the screen follows Progress -> Growth -> Achievements:
 * what the student finished, a place reserved for their own growth (empty until the learning profile exists), and the
 * help they used as "tools". No score, no rank, no comparison, nothing about another student.
 */
import type { PlayableState } from "./list";
import type { ToolUse } from "./messages";
import type { PlayWord } from "./types";

export type NextPuzzle = { assignmentId: string; title: string; state: PlayableState };

export type ResultView = {
  assignmentId: string;
  title: string;
  /** completed = the student finished it; closed = the class closed it first (read-only, no correctness shown). */
  status: "completed" | "closed";
  rows: number;
  cols: number;
  words: PlayWord[];
  /** The student's own letters: what they typed plus the cells they were given. Never marked right or wrong. */
  letters: Record<string, string>;
  /** Keys of the cells they were given (prefilled or revealed), so the grid can show them as given. */
  givenKeys: string[];
  wordCount: number;
  tools: ToolUse;
  activeSeconds: number;
  /** Reserved for the student's own growth against their own past (Student Learning Profile). Always null for now. */
  growth: null;
  next: NextPuzzle | null;
  /** Any other puzzle in the student's list (so "other puzzles" has somewhere to go). */
  hasOtherPuzzles: boolean;
};

/** Where the result page sends the student after finishing: the next puzzle, the list, or home (in that order). */
export function nextStep(next: NextPuzzle | null, hasOtherPuzzles: boolean): { href: string; label: "next" | "list" | "home" } {
  if (next) return { href: `/student/crosswords/${next.assignmentId}`, label: "next" };
  return hasOtherPuzzles ? { href: "/student/crosswords", label: "list" } : { href: "/student", label: "home" };
}
