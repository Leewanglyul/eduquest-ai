/**
 * Teacher-side team play shapes (M2-3.4 TP-0). Teacher-only: names and student numbers are shown to the classroom's
 * teachers, never to students. No counts of contribution, no balance, no letters (TPS 7, 7.1).
 */

export type TeamStudent = { studentId: string; studentNo: string; displayName: string };

export type TeamRow = {
  teamId: string;
  label: string;
  /** The team has a shared attempt: members can no longer be moved out or removed (P2 D-3). */
  started: boolean;
  memberCount: number;
  /** Fewer than 3 active members: a warning, not a block (P2 D-2). */
  underMin: boolean;
  helpOpen: boolean;
  members: TeamStudent[];
};

export type TeamSetup = { teams: TeamRow[]; unassigned: TeamStudent[] };

export const TEAM_MAX = 4;
export const TEAM_MIN = 3;

export type LiveSession = "scheduled" | "open" | "closed";
export type LiveState = "not_started" | "in_progress" | "completed";

/** One student on the in-class view: name, number and state only (TPS 7.1). No progress figure, no time, no letters. */
export type LiveStudent = { displayName: string; studentNo: string; state: LiveState };

export type LiveTeam = {
  teamId: string;
  label: string;
  state: LiveState;
  helpOpen: boolean;
  /** Operational only (PD-2): a team with no member cannot play. */
  blocked: "no_members" | null;
  /** Team-level last progress, a reference for the teacher only (PD-3, I-2): no threshold, no label. */
  lastProgressAt: string | null;
  members: LiveStudent[];
};

export type LiveView = {
  mode: "individual" | "team";
  session: LiveSession;
  /** Operational reasons the room cannot start (PD-2): not open yet; students still waiting for a team. */
  sessionBlocked: ("not_open" | "unassigned")[];
  teams: LiveTeam[];
  /** Team mode: students not in a team yet. Individual mode: every student. Roster order. */
  students: LiveStudent[];
  asOf: string;
};
