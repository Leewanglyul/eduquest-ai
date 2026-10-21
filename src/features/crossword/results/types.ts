export type ProgressState = "not_started" | "in_progress" | "completed";

/** One student of the classroom for one assignment. Counts and times only: no letters, no answers, no cell keys. */
export type ProgressRow = {
  studentId: string;
  studentNo: string;
  displayName: string;
  state: ProgressState;
  filledCount: number;
  totalCells: number;
  lastSavedAt: string | null;
  completedAt: string | null;
  checksUsed: number;
  revealsUsed: number;
  chosungUsed: number;
  wrongSubmits: number;
};
