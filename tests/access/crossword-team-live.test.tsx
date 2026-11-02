import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrosswordLiveView } from "@/components/teacher/crossword-live-view";
import { CrosswordTeamSetup } from "@/components/teacher/crossword-team-setup";
import { LiveRefresher, type RefreshOutcome } from "@/components/teacher/live-refresher";
import type { ProgressRow } from "@/features/crossword/results/types";
import { buildLiveView, LIVE_TEXT, sessionOf } from "@/features/crossword/teams/live";
import type { LiveView, TeamSetup } from "@/features/crossword/teams/types";

// M2-3.4 TP-0: the in-class view model, its 10-second refresh, and what the teacher screens render.

// Static rendering has no mounted app router; the screens only call refresh() after an action.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const S = (n: number) => ({ studentId: `s${n}`, studentNo: String(n), displayName: `학생${n}` });
const P = (n: number, over: Partial<ProgressRow>): ProgressRow => ({
  studentId: `s${n}`, studentNo: String(n), displayName: `학생${n}`, state: "not_started", filledCount: 17, totalCells: 30,
  lastSavedAt: null, completedAt: null, checksUsed: 3, revealsUsed: 2, chosungUsed: 1, wrongSubmits: 4, ...over,
});
const setup: TeamSetup = {
  teams: [
    { teamId: "t1", label: "1팀", started: true, memberCount: 3, underMin: false, helpOpen: true, members: [S(10), S(2), S(3)] },
    { teamId: "t2", label: "2팀", started: false, memberCount: 0, underMin: true, helpOpen: false, members: [] },
  ],
  unassigned: [S(9), S(4)],
};
const progress = [
  P(2, { state: "in_progress", lastSavedAt: "2026-11-02T01:00:00Z" }),
  P(3, { state: "in_progress", lastSavedAt: "2026-11-02T01:05:00Z" }),
  P(10, { state: "not_started" }),
];
const now = new Date("2026-11-02T02:00:00Z");
const open = { status: "open" as const, opensAt: null, closesAt: null, playMode: "team" as const };

describe("buildLiveView", () => {
  const v = buildLiveView({ assignment: open, setup, progress, now });

  it("keeps state only: no counts, figures, letters or per-student time", () => {
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/filled|checks|reveals|chosung|wrong|17|30|studentId|credit|balance|contribution/i);
    expect(Object.keys(v.teams[0].members[0]).sort()).toEqual(["displayName", "state", "studentNo"]);
  });

  it("team state, open call, team-level last progress, operational blocked state", () => {
    expect(v.teams[0]).toMatchObject({ label: "1팀", state: "in_progress", helpOpen: true, blocked: null, lastProgressAt: "2026-11-02T01:05:00Z" });
    expect(v.teams[1]).toMatchObject({ label: "2팀", state: "not_started", blocked: "no_members", lastProgressAt: null });
    expect(v.sessionBlocked).toEqual(["unassigned"]);
  });

  it("students in roster order only, never by progress", () => {
    expect(v.teams[0].members.map((m) => m.studentNo)).toEqual(["2", "3", "10"]);
    expect(v.students.map((s) => s.studentNo)).toEqual(["4", "9"]);
  });

  it("completed when the shared attempt is completed", () => {
    const done = buildLiveView({ assignment: open, setup, progress: [P(2, { state: "completed" }), P(3, { state: "completed" })], now });
    expect(done.teams[0].state).toBe("completed");
  });

  it("session state from the assignment window", () => {
    expect(sessionOf(open, now)).toBe("open");
    expect(sessionOf({ ...open, status: "closed" }, now)).toBe("closed");
    expect(sessionOf({ ...open, opensAt: "2026-11-02T03:00:00Z" }, now)).toBe("scheduled");
    expect(sessionOf({ ...open, closesAt: "2026-11-02T01:00:00Z" }, now)).toBe("closed");
    const scheduled = buildLiveView({ assignment: { ...open, opensAt: "2026-11-02T03:00:00Z" }, setup, progress, now });
    expect(scheduled.sessionBlocked).toEqual(["not_open"]);
  });

  it("individual mode: no teams, every student with a state", () => {
    const solo = buildLiveView({ assignment: { ...open, playMode: "individual" }, setup: { teams: [], unassigned: [S(2), S(3)] }, progress, now });
    expect(solo.teams).toEqual([]);
    expect(solo.students.map((s) => s.state)).toEqual(["in_progress", "in_progress"]);
    expect(solo.sessionBlocked).toEqual([]);
  });
});

describe("LiveRefresher (PD-5)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(outcomes: RefreshOutcome<number>[] = []) {
    const data: number[] = [];
    const failures: boolean[] = [];
    let hold = false;
    let gate: (() => void) | null = null;
    let n = 0;
    const load = vi.fn(async (): Promise<RefreshOutcome<number>> => {
      if (hold) await new Promise<void>((r) => { gate = r; });
      return outcomes.shift() ?? { ok: true, data: ++n };
    });
    const r = new LiveRefresher<number>({ load, onData: (d) => data.push(d), onFailure: (f) => failures.push(f) });
    return { r, load, data, failures, holdNext: () => { hold = true; }, release: () => { hold = false; gate?.(); } };
  }

  it("refreshes every ten seconds", async () => {
    const t = setup();
    t.r.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(t.load).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.load).toHaveBeenCalledTimes(2);
    t.r.dispose();
  });

  it("manual refresh at once; one request in flight", async () => {
    const t = setup();
    t.holdNext();
    const a = t.r.refreshNow();
    const b = t.r.refreshNow();
    expect(t.r.busy).toBe(true);
    t.release();
    await Promise.all([a, b]);
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.data).toEqual([1]);
    t.r.dispose();
  });

  it("pauses while hidden and refreshes at once when visible", async () => {
    const t = setup();
    t.r.start();
    t.r.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.load).toHaveBeenCalledTimes(0);
    t.r.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.load).toHaveBeenCalledTimes(1);
    t.r.dispose();
  });

  it("a failure keeps the last good data and reports once; the next tick recovers", async () => {
    const t = setup([{ ok: true, data: 7 }, { ok: false }]);
    await t.r.refreshNow();
    await t.r.refreshNow();
    expect(t.data).toEqual([7]);
    expect(t.failures).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.data.at(-1)).toBe(1);
    expect(t.failures.at(-1)).toBe(false);
    t.r.dispose();
  });
});

describe("teacher screens", () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const view: LiveView = buildLiveView({ assignment: open, setup, progress, now });

  it("live view: teacher-only, state words only, help and close for the owner", () => {
    const html = renderToStaticMarkup(<CrosswordLiveView puzzleId="p" assignmentId="a" initial={view} canWrite />);
    const t = text(html);
    expect(html).toContain('data-screen="teacher-only"');
    expect(t).toContain(LIVE_TEXT.teacherOnly);
    expect(t).toContain(LIVE_TEXT.helpOpen);
    expect(t).toContain(LIVE_TEXT.resolve);
    expect(t).toContain(LIVE_TEXT.close);
    expect(t).toContain(LIVE_TEXT.blockedNoMembers);
    expect(t).toContain(LIVE_TEXT.blockedUnassigned);
    expect(t).toContain(LIVE_TEXT.refresh);
    expect(t).not.toMatch(/\d+\s*\/\s*\d+|%|점수|순위|랭킹|기여|참여도|균형|주도|따라/);
  });

  it("live view for the school admin: read-only notice, no resolve button; close stays (existing close contract)", () => {
    const t = text(renderToStaticMarkup(<CrosswordLiveView puzzleId="p" assignmentId="a" initial={view} canWrite={false} />));
    expect(t).toContain(LIVE_TEXT.readOnlyViewer);
    expect(t).not.toContain(LIVE_TEXT.resolve);
    expect(t).toContain(LIVE_TEXT.close);
  });

  it("a closed session has no close button", () => {
    const closed = buildLiveView({ assignment: { ...open, status: "closed" }, setup, progress, now });
    expect(text(renderToStaticMarkup(<CrosswordLiveView puzzleId="p" assignmentId="a" initial={closed} canWrite />))).not.toContain(LIVE_TEXT.close);
  });

  it("team setup: size warning, started teams locked, read-only for the admin", () => {
    const owner = text(renderToStaticMarkup(<CrosswordTeamSetup assignmentId="a" playMode="team" setup={setup} canWrite />));
    expect(owner).toContain("3명보다 적어요");
    expect(owner).toContain("팀 만들기");
    expect(owner).toContain("팀 지우기"); // for the team that has not started
    expect(owner).toContain("1팀");
    const html = renderToStaticMarkup(<CrosswordTeamSetup assignmentId="a" playMode="team" setup={setup} canWrite />);
    expect(html).toMatch(/data-team-started="true"[\s\S]*?<\/li><\/ul>/);
    const started = html.slice(html.indexOf('data-team-started="true"'), html.indexOf('data-team-started="false"'));
    expect(started).not.toContain("빼기");
    expect(started).not.toContain("팀 지우기");
    const viewer = text(renderToStaticMarkup(<CrosswordTeamSetup assignmentId="a" playMode="team" setup={setup} canWrite={false} />));
    expect(viewer).toContain(LIVE_TEXT.readOnlyViewer);
    expect(viewer).not.toContain("팀 만들기");
    expect(viewer).not.toContain("넣기");
    expect(viewer).not.toMatch(/점수|순위|능력|수준|잘하는|못하는/);
  });
});
