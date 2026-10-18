/**
 * The student's puzzle list: row shape, state words and the fixed ordering (doc 08 A, D). Pure: no database, no
 * server-only import, so the list page and the tests can use it. The ordering never looks at a score or at other
 * students: in progress first, then new, then closed-unfinished, then completed.
 */
export type PlayableState = "new" | "in_progress" | "closed" | "completed";

export type PlayableRow = {
  assignmentId: string;
  puzzleId: string;
  title: string;
  classroomId: string;
  classroomName: string;
  level: "easy" | "normal" | "hard";
  wordCount: number;
  totalCells: number;
  closesAt: string | null;
  attemptId: string | null;
  attemptStatus: "in_progress" | "completed" | null;
  /** Cells that hold something (typed, prefilled or revealed). Never a count of correct cells. */
  filledCount: number;
  readonly: boolean;
  /** 새 퍼즐 · 이어하기 · 마감 · 완료 */
  state: PlayableState;
};

export function stateOf(row: Pick<PlayableRow, "attemptId" | "attemptStatus" | "readonly">): PlayableState {
  if (row.attemptStatus === "completed") return "completed";
  if (row.attemptId === null) return "new";
  return row.readonly ? "closed" : "in_progress";
}

const STATE_ORDER: Record<PlayableState, number> = { in_progress: 0, new: 1, closed: 2, completed: 3 };

/** Soonest closing first; a puzzle with no closing time after those that have one. */
const closing = (r: PlayableRow) => (r.closesAt ? Date.parse(r.closesAt) : Number.POSITIVE_INFINITY);

export function sortPlayable(rows: readonly PlayableRow[]): PlayableRow[] {
  return [...rows].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      (closing(a) === closing(b) ? 0 : closing(a) < closing(b) ? -1 : 1) ||
      a.title.localeCompare(b.title, "ko") ||
      a.classroomName.localeCompare(b.classroomName, "ko") ||
      a.assignmentId.localeCompare(b.assignmentId),
  );
}

/**
 * The next puzzle after finishing one (decision N7): the first puzzle the list itself would show that the student can
 * still work on (in progress, or not started, and open), other than the one just finished. Fixed and explainable;
 * never chosen by a score, a speed or anyone else's progress. null when there is none.
 */
export function pickNextPlayable(rows: readonly PlayableRow[], currentAssignmentId: string): PlayableRow | null {
  return (
    sortPlayable(rows).find(
      (r) => r.assignmentId !== currentAssignmentId && !r.readonly && (r.state === "new" || r.state === "in_progress"),
    ) ?? null
  );
}
