import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrosswordPlayBoard } from "@/components/student/crossword-play-board";
import { CrosswordPlayList } from "@/components/student/crossword-play-list";
import { CrosswordResult } from "@/components/student/crossword-result";
import { PlayTools } from "@/components/student/play-tools";
import { TeamNotice } from "@/components/student/team-notice";
import type { PlayableRow } from "@/features/crossword/play/list";
import { PLAY_TEXT } from "@/features/crossword/play/messages";
import { participationLine, type ResultView } from "@/features/crossword/play/result";
import type { PlayLimits, PlayPayload, PlayWord } from "@/features/crossword/play/types";

// M2-3.4 P3 L3: the student team screens rendered to static markup and read as text. Neutral and positive wording
// only; never a name, a per-student count, a ranking or a writer mark.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const NEVER = /점수|순위|등수|랭킹|리더보드|배지|경쟁|못했|안 했|참여하지|꼴찌|[0-9a-f]{8}-[0-9a-f]{4}-/;
const W = (number: number, direction: "across" | "down", row: number, col: number, length: number): PlayWord => ({
  number, direction, row, col, length, single: false, clue: `단서 ${number}`,
});
const WORDS: PlayWord[] = [W(1, "across", 0, 0, 2), W(2, "down", 0, 1, 2)];
const LIMITS: PlayLimits = { checkMode: "anytime", checksAllowed: 5, checksRemaining: 3, revealsAllowed: 2, revealsRemaining: 1, chosungAllowed: true };
const payload = (over: Partial<PlayPayload> = {}): PlayPayload => ({
  v: 1, assignmentId: "a1", attempt: { status: "in_progress", revision: 3 },
  puzzle: { title: "광합성 퍼즐", rows: 2, cols: 2, words: WORDS, inputMode: "hangul" }, given: {}, cells: {}, limits: LIMITS, readonly: false, closesAt: null, ...over,
});
const row = (over: Partial<PlayableRow>): PlayableRow => ({
  assignmentId: "a1", puzzleId: "p1", title: "광합성 퍼즐", classroomId: "c1", classroomName: "1반", level: "normal", wordCount: 12, totalCells: 40,
  closesAt: null, attemptId: null, attemptStatus: null, filledCount: 0, readonly: false, state: "new", ...over,
});
const view = (over: Partial<ResultView> = {}): ResultView => ({
  assignmentId: "a1", title: "광합성 퍼즐", status: "completed", rows: 2, cols: 2, words: WORDS, letters: { "0,0": "사" }, givenKeys: [],
  wordCount: 2, tools: { checks: 1, reveals: 0, chosung: 0 }, activeSeconds: 120, growth: null, next: null, hasOtherPuzzles: false, ...over,
});

describe("board heading", () => {
  it("team mode: label and member count, no names", () => {
    const t = text(renderToStaticMarkup(<CrosswordPlayBoard payload={payload({ team: { label: "1팀", memberCount: 3 } })} />));
    expect(t).toContain("1팀 · 3명");
    expect(t).toContain(PLAY_TEXT.callTeacher);
    expect(t).not.toMatch(NEVER);
  });

  it("individual mode: no team line and no teacher-call button", () => {
    const t = text(renderToStaticMarkup(<CrosswordPlayBoard payload={payload()} />));
    expect(t).not.toContain("명");
    expect(t).not.toContain(PLAY_TEXT.callTeacher);
    expect(t).not.toContain("팀");
  });
});

describe("teacher call button (team only)", () => {
  const tools = (teacherCall: Parameters<typeof PlayTools>[0]["teacherCall"], disabled = false) =>
    renderToStaticMarkup(
      <PlayTools limits={LIMITS} disabled={disabled} canSubmit={false} onCheck={() => {}} onReveal={() => {}} onChosung={() => {}} onSubmit={() => {}} teacherCall={teacherCall} />,
    );

  it("ready, open and waiting states", () => {
    expect(tools({ open: false, waitSeconds: null, onCall: () => {} })).toMatch(/data-teacher-call="ready"[^>]*>선생님 부르기</);
    const open = tools({ open: true, waitSeconds: null, onCall: () => {} });
    expect(open).toContain('data-teacher-call="open"');
    expect(open).toMatch(/disabled=""[^>]*>도움 요청 중</);
    const wait = tools({ open: false, waitSeconds: 42, onCall: () => {} });
    expect(wait).toContain('data-teacher-call="wait"');
    expect(text(wait)).toContain("다시 부르기 (42초 뒤)"); // the server's seconds, not an invented number
  });

  it("hidden once the board is read-only or completed, and absent in individual mode", () => {
    expect(tools({ open: false, waitSeconds: null, onCall: () => {} }, true)).not.toContain("data-teacher-call");
    expect(tools(undefined)).not.toContain("data-teacher-call");
  });
});

describe("teammate notice (D9)", () => {
  it("is in the status area and says nothing until a change arrives", () => {
    const html = renderToStaticMarkup(<TeamNotice text={PLAY_TEXT.teammateChanged} stamp={0} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-team-notice="hidden"');
    expect(text(html)).toBe("");
  });
});

describe("student list: team rows", () => {
  it("a team row shows 팀 활동; a waiting row cannot be opened and says 팀 배정 대기", () => {
    const html = renderToStaticMarkup(
      <CrosswordPlayList rows={[row({ assignmentId: "t1", team: { waiting: false } }), row({ assignmentId: "t2", title: "대기 퍼즐", team: { waiting: true } })]} />,
    );
    expect(text(html)).toContain(PLAY_TEXT.teamListTag);
    expect(html).toContain("/student/crosswords/t1");
    expect(html).not.toContain("/student/crosswords/t2");
    expect(html).toContain('data-team-waiting="true"');
    expect(text(html)).toContain(PLAY_TEXT.teamWaiting);
  });

  it("an individual row renders exactly as before (no team words)", () => {
    expect(text(renderToStaticMarkup(<CrosswordPlayList rows={[row({})]} />))).not.toContain("팀");
  });
});

describe("result: team wording and participation (D-8, P3-D4)", () => {
  it("participation words are positive only, and nothing is said when this student did not take part", () => {
    expect(participationLine({ me: true, all: true })).toBe("all");
    expect(participationLine({ me: false, all: true })).toBe("all");
    expect(participationLine({ me: true, all: false })).toBe("me");
    expect(participationLine({ me: false, all: false })).toBeNull();
    expect(participationLine(null)).toBeNull();

    const all = text(renderToStaticMarkup(<CrosswordResult view={view({ team: { label: "1팀", participation: { me: true, all: true } } })} />));
    expect(all).toContain(PLAY_TEXT.teamCompleted);
    expect(all).toContain(PLAY_TEXT.participationAll);
    expect(all).toContain("우리 팀이 푼 퍼즐");
    const me = text(renderToStaticMarkup(<CrosswordResult view={view({ team: { label: "1팀", participation: { me: true, all: false } } })} />));
    expect(me).toContain(PLAY_TEXT.participationMe);
    const nothing = renderToStaticMarkup(<CrosswordResult view={view({ team: { label: "1팀", participation: { me: false, all: false } } })} />);
    expect(nothing).not.toContain("data-participation");
    for (const t of [all, me, text(nothing)]) expect(t).not.toMatch(NEVER);
  });

  it("an individual result is unchanged", () => {
    const t = text(renderToStaticMarkup(<CrosswordResult view={view()} />));
    expect(t).toContain(PLAY_TEXT.completed);
    expect(t).toContain("내가 푼 퍼즐");
    expect(t).not.toContain("팀");
  });
});
