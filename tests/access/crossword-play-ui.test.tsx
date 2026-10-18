import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrosswordPlayList } from "@/components/student/crossword-play-list";
import { CrosswordResult } from "@/components/student/crossword-result";
import { PlayClues } from "@/components/student/play-clues";
import { PlayGrid } from "@/components/student/play-grid";
import { PlayTools } from "@/components/student/play-tools";
import { SaveIndicator } from "@/components/student/save-indicator";
import { cellAccessibleName, ordinalKo, selectionAnnouncement, wordName } from "@/features/crossword/play/a11y";
import { LEVEL_LABEL, STATE_LABEL, formatClosing, formatMinutes } from "@/features/crossword/play/labels";
import { pickNextPlayable, sortPlayable, stateOf, type PlayableRow } from "@/features/crossword/play/list";
import { nextStep, type ResultView } from "@/features/crossword/play/result";
import type { PlayLimits, PlayWord } from "@/features/crossword/play/types";
import { isCrosswordPlayEnabled } from "@/lib/flags";

// Rendering tests: the student screens are server-rendered to static markup and read as text. They pin the words, the
// roles and names a screen reader hears, the actions, and the absence of anything competitive. They do not replace the
// browser verification (layout, touch, IME), which is done on the built app and on the devices.

const W = (number: number, direction: "across" | "down", row: number, col: number, length: number): PlayWord => ({
  number, direction, row, col, length, single: false, clue: `단서 ${number}`,
});
const WORDS: PlayWord[] = [W(1, "across", 0, 0, 2), W(2, "down", 0, 1, 2), W(3, "across", 1, 1, 2), W(4, "down", 1, 2, 2), W(5, "across", 2, 2, 2)];

const FORBIDDEN = /점수|감점|벌점|패널티|페널티|순위|등수|랭킹|리더보드|배지|뱃지|꼴찌|경쟁|팀|\b\d+\s*\/\s*\d+\s*점/;

const row = (over: Partial<PlayableRow>): PlayableRow => ({
  assignmentId: "a1", puzzleId: "p1", title: "광합성 퍼즐", classroomId: "c1", classroomName: "1반", level: "normal", wordCount: 12, totalCells: 40,
  closesAt: "2030-10-20T06:00:00Z", attemptId: null, attemptStatus: null, filledCount: 0, readonly: false, state: "new", ...over,
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("accessible names", () => {
  it("ordinals and word names", () => {
    expect([1, 2, 3, 10, 15, 16].map(ordinalKo)).toEqual(["첫 번째", "두 번째", "세 번째", "열 번째", "열다섯 번째", "16번째"]);
    expect(wordName({ number: 1, direction: "across", length: 2 })).toBe("가로 1번, 2글자");
  });
  it("a cell says where it is, what it holds and what a check found", () => {
    const word = { number: 3, direction: "down" as const, length: 4 };
    expect(cellAccessibleName({ word, index: 0, state: "empty" })).toBe("세로 3번, 4글자, 첫 번째 칸, 비어 있음");
    expect(cellAccessibleName({ word, index: 1, state: "typed", letter: "사" })).toBe("세로 3번, 4글자, 두 번째 칸, 입력됨, 사");
    expect(cellAccessibleName({ word, index: 2, state: "pending", letter: "ㅅ" })).toBe("세로 3번, 4글자, 세 번째 칸, 조합 중, ㅅ");
    expect(cellAccessibleName({ word, index: 3, state: "given", letter: "과", mark: "ok" })).toBe("세로 3번, 4글자, 네 번째 칸, 알려 준 칸, 과, 맞음");
    expect(cellAccessibleName({ word, index: 0, state: "typed", letter: "가", mark: "wrong" })).toContain("다시 보기");
  });
  it("the selection announcement names the word, the position and the clue", () => {
    expect(selectionAnnouncement({ number: 2, direction: "across", length: 3, clue: "먹는 것" }, 1)).toBe("가로 2번, 3글자, 두 번째 칸. 단서: 먹는 것");
  });
});

describe("labels", () => {
  it("levels and states are plain words with an icon that is only decoration", () => {
    expect(LEVEL_LABEL).toEqual({ easy: "쉬움", normal: "보통", hard: "어려움" });
    expect(Object.values(STATE_LABEL).map((s) => s.text)).toEqual(["새 퍼즐", "이어하기", "마감", "완료"]);
    expect(Object.values(STATE_LABEL).map((s) => s.action)).toEqual(["시작하기", "이어하기", "결과 보기", "결과 보기"]);
  });
  it("closing time in Korean time", () => {
    expect(formatClosing("2030-10-20T06:00:00Z")).toBe("10월 20일 오후 3:00까지");
    expect(formatClosing("2030-10-20T15:30:00Z")).toBe("10월 21일 오전 12:30까지");
    expect(formatClosing(null)).toBeNull();
    expect(formatClosing("not a date")).toBeNull();
  });
  it("time spent as a plain phrase", () => {
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(30)).toBe("1분 미만");
    expect(formatMinutes(750)).toBe("약 13분");
  });
});

describe("the go-live gate for student play", () => {
  it("is on against a local stack, off against a hosted project, and an explicit switch wins", () => {
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(true);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe(true);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
    expect(isCrosswordPlayEnabled({})).toBe(false);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", CROSSWORD_PLAY_ENABLED: "true" })).toBe(true);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", CROSSWORD_PLAY_ENABLED: "false" })).toBe(false);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", CROSSWORD_PLAY_ENABLED: "1" })).toBe(false);
  });
});

describe("next puzzle (decision N7)", () => {
  it("is the first puzzle the list would show that can still be worked on, never the one just finished", () => {
    const rows = [
      row({ assignmentId: "done", state: "completed", attemptId: "x", attemptStatus: "completed" }),
      row({ assignmentId: "late", state: "new", closesAt: "2031-01-01T00:00:00Z" }),
      row({ assignmentId: "soon", state: "new", closesAt: "2030-01-01T00:00:00Z" }),
      row({ assignmentId: "mid", state: "in_progress", attemptId: "y", attemptStatus: "in_progress", closesAt: "2032-01-01T00:00:00Z" }),
      row({ assignmentId: "shut", state: "closed", attemptId: "z", attemptStatus: "in_progress", readonly: true }),
    ];
    expect(pickNextPlayable(rows, "done")?.assignmentId).toBe("mid"); // in progress comes first in the list
    expect(pickNextPlayable(rows, "mid")?.assignmentId).toBe("soon");
    expect(pickNextPlayable(rows.filter((r) => r.assignmentId === "done" || r.assignmentId === "shut"), "done")).toBeNull();
    expect(pickNextPlayable([], "x")).toBeNull();
    // it never reorders its input
    const copy = JSON.stringify(rows);
    pickNextPlayable(rows, "done");
    expect(JSON.stringify(rows)).toBe(copy);
    void sortPlayable;
    void stateOf;
  });
  it("where the result page sends the student: next puzzle, else the list, else home", () => {
    expect(nextStep({ assignmentId: "n1", title: "t", state: "new" }, true)).toEqual({ href: "/student/crosswords/n1", label: "next" });
    expect(nextStep(null, true)).toEqual({ href: "/student/crosswords", label: "list" });
    expect(nextStep(null, false)).toEqual({ href: "/student", label: "home" });
  });
});

describe("puzzle list screen", () => {
  const rows = [
    row({ assignmentId: "i", title: "진행 퍼즐", state: "in_progress", attemptId: "a", attemptStatus: "in_progress", filledCount: 14 }),
    row({ assignmentId: "n", title: "새 퍼즐 하나", state: "new" }),
    row({ assignmentId: "c", title: "닫힌 퍼즐", state: "closed", attemptId: "b", attemptStatus: "in_progress", readonly: true, filledCount: 5 }),
    row({ assignmentId: "d", title: "끝낸 퍼즐", state: "completed", attemptId: "e", attemptStatus: "completed", filledCount: 40, closesAt: null }),
  ];
  const html = renderToStaticMarkup(<CrosswordPlayList rows={rows} />);
  const t = text(html);

  it("one card per assignment with its state as a word, level, classroom and the closing time", () => {
    expect((html.match(/<article/g) ?? []).length).toBe(4);
    for (const w of ["이어하기", "새 퍼즐", "마감", "완료", "1반", "낱말 12개", "보통", "10월 20일 오후 3:00까지"]) expect(t, w).toContain(w);
    expect(t).toContain("수업에서 닫힌 퍼즐이에요.");
    expect(t).toContain("완성했어요.");
  });

  it("progress is the number of filled cells, with a native progress element and a spoken name", () => {
    expect(t).toContain("채운 칸 14/40");
    expect(html).toMatch(/<progress[^>]*aria-label="채운 칸 14개, 전체 40개"/);
    expect(html).toContain('max="40"');
  });

  it("each action goes to the right page and its link name includes the puzzle", () => {
    expect(html).toContain('href="/student/crosswords/i"');
    expect(html).toContain('href="/student/crosswords/n"');
    expect(html).toContain('href="/student/crosswords/c/result"');
    expect(html).toContain('href="/student/crosswords/d/result"');
    expect(t).toMatch(/시작하기 새 퍼즐 하나/);
    expect(t).toMatch(/결과 보기 끝낸 퍼즐/);
  });

  it("is a labelled list; the icon is hidden from screen readers", () => {
    expect(html).toContain('<ul aria-label="풀 수 있는 퍼즐 목록"');
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("an empty list explains itself", () => {
    expect(text(renderToStaticMarkup(<CrosswordPlayList rows={[]} />))).toContain("지금 풀 수 있는 퍼즐이 없어요");
  });

  it("nothing competitive or score-like, and nothing about other students", () => {
    expect(t).not.toMatch(FORBIDDEN);
    expect(t).not.toMatch(/다른 학생|친구|반 평균|등/);
  });
});

describe("grid", () => {
  const html = renderToStaticMarkup(
    <PlayGrid
      label="시험 퍼즐 판"
      rows={3}
      cols={4}
      words={WORDS}
      cells={{ "0,0": "사", "0,1": "가" }}
      given={{ "2,3": "례" }}
      pending={{ "1,1": "ㅇ" }}
      marks={{ "0,0": "ok", "0,1": "wrong" }}
      selection={{ key: "0,1", direction: "across" }}
      onSelectCell={() => {}}
    />,
  );

  it("is a grid of rows of cells, one cell per puzzle cell", () => {
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="시험 퍼즐 판"');
    expect((html.match(/role="row"/g) ?? []).length).toBe(3);
    expect((html.match(/role="gridcell"/g) ?? []).length).toBe(6);
  });

  it("every cell has a name with word, position, state and the letter", () => {
    expect(html).toContain('aria-label="가로 1번, 2글자, 첫 번째 칸, 입력됨, 사, 맞음"');
    expect(html).toContain('aria-label="가로 1번, 2글자, 두 번째 칸, 입력됨, 가, 다시 보기"');
    expect(html).toContain("조합 중, ㅇ");
    expect(html).toContain("알려 준 칸, 례");
    expect(html).toContain("비어 있음");
  });

  it("the selected cell and word are told apart without colour; checked cells carry ✓ and ✗", () => {
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(html).toContain("border-[3px]"); // thick border on the selected cell
    expect(html).toContain("✓");
    expect(html).toContain("✗");
    expect(html).toContain("underline"); // pending text is underlined too
  });

  it("starting cells show their clue number, hidden from screen readers (the name already says it)", () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*>1<\/span>/);
  });

  it("a read-only grid has no selected cell", () => {
    const ro = renderToStaticMarkup(<PlayGrid label="x" rows={3} cols={4} words={WORDS} cells={{}} given={{}} />);
    expect(ro).not.toContain('aria-selected="true"');
  });
});

describe("clues", () => {
  const html = renderToStaticMarkup(<PlayClues words={WORDS} current={WORDS[1]} chosung={{ "1across": "ㅅㄱ" }} onSelectWord={() => {}} />);
  it("two real lists, every clue a button, the current one marked", () => {
    expect(html).toContain("가로");
    expect(html).toContain("세로");
    expect((html.match(/<ol/g) ?? []).length).toBe(2);
    expect((html.match(/<button/g) ?? []).length).toBe(5);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(text(html)).toContain("단서 2 (2글자)");
    expect(text(html)).toContain("초성 ㅅㄱ");
  });
});

describe("save indicator (PM SP-3)", () => {
  const snap = (state: "saving" | "saved" | "offline", blocked: Parameters<typeof SaveIndicator>[0]["snapshot"]["blocked"] = null) => ({ state, revision: 1, blocked, pendingCells: 0 });
  it("saving, saved and offline each say so in words, with a status role", () => {
    for (const [state, word] of [["saving", "저장 중"], ["saved", "저장됨"], ["offline", "오프라인"]] as const) {
      const html = renderToStaticMarkup(<SaveIndicator snapshot={snap(state)} />);
      expect(text(html), state).toContain(word);
      expect(html).toContain('role="status"');
      expect(html).toContain(`data-save-state="${state}"`);
    }
  });
  it("offline says what to do", () => {
    expect(text(renderToStaticMarkup(<SaveIndicator snapshot={snap("offline")} />))).toContain("연결되면 자동으로 저장돼요");
  });
  it("a refusal shows its own reason, not the indicator", () => {
    const closed = text(renderToStaticMarkup(<SaveIndicator snapshot={snap("saved", "READONLY")} />));
    expect(closed).toContain("수업에서 닫힌 퍼즐입니다");
    const signedOut = text(renderToStaticMarkup(<SaveIndicator snapshot={snap("saved", "UNKNOWN")} />));
    expect(signedOut).toContain("다시 로그인");
    expect(signedOut).not.toContain("닫힌");
    expect(renderToStaticMarkup(<SaveIndicator snapshot={snap("saved", "READONLY")} />)).toContain('data-save-state="blocked"');
  });
});

describe("hint tools", () => {
  const limits = (over: Partial<PlayLimits>): PlayLimits => ({ checkMode: "onRequest", checksAllowed: 5, checksRemaining: 5, revealsAllowed: 2, revealsRemaining: 2, chosungAllowed: true, ...over });
  const render = (l: PlayLimits, disabled = false, canSubmit = true) =>
    renderToStaticMarkup(<PlayTools limits={l} disabled={disabled} canSubmit={canSubmit} onCheck={() => {}} onReveal={() => {}} onChosung={() => {}} onSubmit={() => {}} />);

  it("easy: cell, word and whole-puzzle checks without a count; reveals and 초성", () => {
    const t = text(render(limits({ checkMode: "anytime", checksAllowed: null, checksRemaining: null, revealsAllowed: 3, revealsRemaining: 3 })));
    for (const w of ["칸 확인", "낱말 확인", "전체 확인", "글자 알려주기 (남은 3번)", "초성 보기", "제출"]) expect(t, w).toContain(w);
    expect(t).not.toContain("낱말 확인 (남은");
  });
  it("normal: word checks only, with what is left", () => {
    const t = text(render(limits({})));
    expect(t).toContain("낱말 확인 (남은 5번)");
    expect(t).not.toContain("칸 확인");
    expect(t).not.toContain("전체 확인");
  });
  it("a teacher override to no checks, no reveals, no 초성 leaves only submit", () => {
    const t = text(render(limits({ checkMode: "submitOnly", checksAllowed: 0, checksRemaining: 0, revealsAllowed: 0, revealsRemaining: 0, chosungAllowed: false })));
    expect(t).toBe("제출");
  });
  it("used-up tools are disabled, not hidden; everything is disabled when read-only; submit waits for a full grid", () => {
    const used = render(limits({ checksRemaining: 0, revealsRemaining: 0 }));
    expect((used.match(/disabled=""/g) ?? []).length).toBe(2);
    expect((render(limits({}), true).match(/disabled=""/g) ?? []).length).toBe(4);
    expect(render(limits({}), false, false)).toMatch(/disabled=""[^>]*>제출/);
  });
  it("buttons are at least 48px tall and the group is labelled", () => {
    const html = render(limits({}));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="도구"');
    expect((html.match(/min-h-12/g) ?? []).length).toBe((html.match(/<button/g) ?? []).length);
  });
  it("the wording is about tools, never about penalties", () => {
    expect(text(render(limits({})))).not.toMatch(FORBIDDEN);
  });
});

describe("result screen", () => {
  const view = (over: Partial<ResultView> = {}): ResultView => ({
    assignmentId: "a1", title: "광합성 퍼즐", status: "completed", rows: 3, cols: 4, words: WORDS,
    letters: { "0,0": "사", "0,1": "과", "1,1": "일", "1,2": "기", "2,2": "차", "2,3": "례" }, givenKeys: ["2,3"], wordCount: 5,
    tools: { checks: 3, reveals: 1, chosung: 2 }, activeSeconds: 750, growth: null, next: { assignmentId: "n1", title: "다음 퍼즐", state: "new" }, hasOtherPuzzles: true, ...over,
  });

  it("follows Progress -> Growth -> tools -> next, with no growth section while it is null", () => {
    const html = renderToStaticMarkup(<CrosswordResult view={view()} />);
    const t = text(html);
    expect(t).toContain("퍼즐을 완성했어요!");
    expect(t).toContain("내가 푼 퍼즐");
    expect(t).toContain("낱말 5개 · 푼 시간 약 13분");
    expect(t).toContain("도구를 활용했어요: 확인 3번, 글자 알려주기 1번, 초성 2번");
    expect(html).not.toContain('data-slot="growth"');
    const order = ["progress", "tools"].map((s) => html.indexOf(`data-slot="${s}"`));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
    expect(html.indexOf('aria-label="다음에 할 일"')).toBeGreaterThan(order[1]);
  });

  it("the next step is the first action: the next puzzle by name, then other puzzles and home", () => {
    const html = renderToStaticMarkup(<CrosswordResult view={view()} />);
    expect(html).toMatch(/<nav aria-label="다음에 할 일"[^>]*><a [^>]*href="\/student\/crosswords\/n1"[^>]*>다음 퍼즐 풀기: 다음 퍼즐<\/a>/);
    expect(text(html)).toContain("다른 퍼즐 보기");
    expect(text(html)).toContain("학생 홈");
  });

  it("without a next puzzle it offers the list, and with nothing else it offers home", () => {
    const list = renderToStaticMarkup(<CrosswordResult view={view({ next: null })} />);
    expect(list).toMatch(/<nav[^>]*><a [^>]*href="\/student\/crosswords"[^>]*>다른 퍼즐 보기/);
    const home = renderToStaticMarkup(<CrosswordResult view={view({ next: null, hasOtherPuzzles: false })} />);
    expect(home).toMatch(/<nav[^>]*><a [^>]*href="\/student"[^>]*>학생 홈/);
  });

  it("no tools used reads as doing it alone", () => {
    expect(text(renderToStaticMarkup(<CrosswordResult view={view({ tools: { checks: 0, reveals: 0, chosung: 0 } })} />))).toContain("도구 없이 스스로 풀었어요");
  });

  it("a puzzle the class closed shows the closed notice and the student's letters with no correctness marks", () => {
    const html = renderToStaticMarkup(<CrosswordResult view={view({ status: "closed", letters: { "0,0": "ㅋ" }, givenKeys: [] })} />);
    const t = text(html);
    expect(t).toContain("수업에서 닫힌 퍼즐입니다");
    expect(t).not.toContain("퍼즐을 완성했어요");
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
    expect(html).toContain('data-result-status="closed"');
  });

  it("nothing score-like, competitive or about other students on the screen", () => {
    for (const v of [view(), view({ status: "closed" }), view({ next: null })]) {
      const t = text(renderToStaticMarkup(<CrosswordResult view={v} />));
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(/다른 학생|친구들|반 평균|등급/);
    }
  });

  it("the grid on the result page is read-only and shows the student's own letters", () => {
    const html = renderToStaticMarkup(<CrosswordResult view={view()} />);
    expect(html).toContain("입력됨, 사");
    expect(html).toContain("알려 준 칸, 례");
    expect(html).not.toContain('aria-selected="true"');
  });
});
