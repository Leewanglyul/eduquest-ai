"use client";

/**
 * The student's crossword play screen (M2-2.4). It owns the state of one attempt in the browser and wires the pieces:
 * the grid and the clue lists (presentational), the one uncontrolled input that receives Korean (use-grid-input + the
 * pure ImeController), the autosave queue and its three-state indicator (PM SP-3), the hint tools and the finishing
 * moment. The key never reaches this component: it holds the student's own cells and the cells they were given.
 *
 * Layout, mobile first: a clue bar pinned at the top; the grid in a named, scrollable region; the input and the
 * word-entry field under it; the tools pinned at the bottom; the clue lists below (beside the grid from 1024px up, which
 * is what a Galaxy Tab S9 in landscape gives).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectionAnnouncement } from "@/features/crossword/play/a11y";
import {
  allFilled,
  firstOpenCell,
  isLoneJamo,
  isValidCellChar,
  moveSelection,
  normalizeTyped,
  selectCell,
  sortedWords,
  stepClue,
  wordCells,
  wordForSelection,
  type Selection,
} from "@/features/crossword/play/cells";
import type { Intent } from "@/features/crossword/play/ime/controller";
import { PLAY_ERROR_MESSAGES, PLAY_TEXT, playMessage } from "@/features/crossword/play/messages";
import { teamLimits, type TeamSnapshot } from "@/features/crossword/play/team";
import type {
  CheckResult,
  CheckStatus,
  HelpCall,
  PlayErrorCode,
  PlayLimits,
  PlayPayload,
  PlayWord,
  SubmitResult,
  TeamState,
} from "@/features/crossword/play/types";
import { CompletionMoment } from "./completion-moment";
import { ImeTrace } from "./ime-trace";
import { ImeTracePanel } from "./ime-trace-panel";
import { PlayClues } from "./play-clues";
import { callPlay, makeSaveSender, makeTeamStateFetcher, type ApiResult } from "./play-api";
import { PlayGrid } from "./play-grid";
import { PlayTools } from "./play-tools";
import { SaveIndicator, blockedText } from "./save-indicator";
import { SaveQueue, type QueueSnapshot } from "./save-queue";
import { applyResultOf, checkWithOneRetry, decidePoll, makeLockedRecovery, teacherCallDeadline } from "./team-board";
import { TeamNotice, TeamSyncNotice } from "./team-notice";
import { TeamPoller, type ApplyResult } from "./team-poller";
import { useGridInput } from "./use-grid-input";

export function CrosswordPlayBoard({ payload }: { payload: PlayPayload }) {
  const { assignmentId, puzzle } = payload;
  const words = puzzle.words;
  const resultHref = `/student/crosswords/${assignmentId}/result`;

  const [cells, setCells] = useState<Record<string, string>>(payload.cells);
  const [given, setGiven] = useState<Record<string, string>>(payload.given);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, CheckStatus>>({});
  const [sel, setSel] = useState<Selection>(() => {
    const first = sortedWords(words)[0];
    return first ? { key: firstOpenCell(first, payload.cells, payload.given), direction: first.direction } : { key: "0,0", direction: "across" };
  });
  const [limits, setLimits] = useState<PlayLimits>(payload.limits);
  const [chosungHints, setChosungHints] = useState<Record<string, string>>({});
  const [done, setDone] = useState(payload.attempt.status === "completed");
  const [moment, setMoment] = useState(false);
  const [message, setMessage] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [save, setSave] = useState<QueueSnapshot>({ state: "saved", revision: payload.attempt.revision, blocked: null, pendingCells: 0 });
  const [wordText, setWordText] = useState("");

  const readOnly = payload.readonly || done || save.blocked !== null;
  const activeKeys = useRef<string[]>([]);
  const dirRef = useRef(sel.direction);
  dirRef.current = sel.direction;
  const lastInputAt = useRef(0);
  const gridRegion = useRef<HTMLDivElement>(null);

  // ---- team mode only (payload.team present); individual mode never sets or reads any of this --------------------
  const team = payload.team ?? null;
  const [teacherCallOpen, setTeacherCallOpen] = useState(false);
  /** Server-given wait before the next teacher call (HELP_COOLDOWN retryAfterSeconds), as a deadline. */
  const [callWaitUntil, setCallWaitUntil] = useState<number | null>(null);
  const [callWaitLeft, setCallWaitLeft] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string | null; stamp: number }>({ text: null, stamp: 0 });
  /** Three team polls in a row failed (network, server or applying): the neutral "팀 화면을 맞추는 중이에요". */
  const [syncDegraded, setSyncDegraded] = useState(false);
  const pollerRef = useRef<TeamPoller | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const givenRef = useRef(given);
  givenRef.current = given;
  const selKeyRef = useRef(sel.key);
  selKeyRef.current = sel.key;
  /** Revision of the last team-state answer (the poller's known revision). Only team-state moves it. */
  const teamRevision = useRef(payload.attempt.revision);
  const snapshot = useRef<TeamSnapshot | null>(null);
  /** Gate 3 C-4: a poll answer was only partly applied (cells held for a composition); resync once it ends. */
  const resyncNeeded = useRef(false);
  const finished = useRef(false);
  const momentShown = useRef(false);

  const queue = useMemo(
    () =>
      new SaveQueue({
        send: makeSaveSender(assignmentId),
        onChange: setSave,
        initialRevision: payload.attempt.revision,
        // K-5, team mode only: a refused save because a teammate revealed a cell drops that cell and sends the rest
        ...(payload.team
          ? {
              recoverLocked: makeLockedRecovery(
                async () => {
                  await pollerRef.current?.pollNow();
                },
                () => givenRef.current,
              ),
            }
          : {}),
      }),
    [assignmentId, payload.attempt.revision, payload.team],
  );

  // ---- intents from the IME controller -> board state ----------------------------------------------------------
  const applyIntents = useCallback(
    (intents: Intent[]) => {
      const keys = activeKeys.current;
      for (const it of intents) {
        if (it.kind === "preview") {
          setPending(Object.fromEntries(it.cells.map((c) => [keys[c.index], c.char])));
        } else if (it.kind === "commit") {
          lastInputAt.current = Date.now();
          setCells((prev) => {
            const next = { ...prev };
            for (const w of it.writes) next[keys[w.index]] = w.char;
            return next;
          });
          setMarks((prev) => {
            const next = { ...prev };
            for (const w of it.writes) delete next[keys[w.index]];
            return next;
          });
          for (const w of it.writes) queue.setCell(keys[w.index], w.char);
        } else if (it.kind === "delete") {
          lastInputAt.current = Date.now();
          const k = keys[it.index];
          setCells((prev) => {
            const next = { ...prev };
            delete next[k];
            return next;
          });
          setMarks((prev) => {
            const next = { ...prev };
            delete next[k];
            return next;
          });
          queue.setCell(k, null);
        } else if (it.kind === "select") {
          setSel({ key: keys[it.index], direction: dirRef.current });
        } else if (it.kind === "reject") {
          setMessage(it.reason === "jamo" ? PLAY_ERROR_MESSAGES.BAD_CHAR : PLAY_TEXT.invalidChar(puzzle.inputMode));
        }
      }
    },
    [queue, puzzle.inputMode],
  );

  // Device validation aid: open the board with ?imetrace=1 to record the IME events and download them (doc 09).
  const [traceOn, setTraceOn] = useState(false);
  const trace = useMemo(() => new ImeTrace(), []);
  const [traceCount, setTraceCount] = useState(0);
  useEffect(() => {
    setTraceOn(new URLSearchParams(window.location.search).get("imetrace") === "1");
  }, []);
  const grid = useGridInput(
    applyIntents,
    traceOn
      ? (e) => {
          trace.record(e);
          setTraceCount(trace.size);
        }
      : undefined,
    {
      inputMode: puzzle.inputMode,
      // Gate 3 C-4: the composition that held cells has ended; fetch the whole grid so no stale cell stays on screen
      onSettled: () => {
        if (!resyncNeeded.current || !pollerRef.current) return;
        resyncNeeded.current = false;
        void pollerRef.current.resync();
      },
    },
  );

  // ---- keep the controller pointed at the selected word ---------------------------------------------------------
  const word = wordForSelection(words, sel);
  useEffect(() => {
    if (!word) return;
    const keys = wordCells(word);
    activeKeys.current = keys;
    if (grid.isComposing()) return;
    grid.setWord({
      length: keys.length,
      selected: Math.max(0, keys.indexOf(sel.key)),
      cells: keys.map((k) => cells[k] ?? given[k] ?? ""),
      locked: keys.map((k) => Boolean(given[k])),
    });
    // cells/given feed the controller's mirror only when the word or the selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.number, word?.direction, sel.key, traceOn]);

  // Tell a screen reader where the student is, once per move (not on every letter).
  useEffect(() => {
    if (!word) return;
    setAnnouncement(selectionAnnouncement(word, Math.max(0, wordCells(word).indexOf(sel.key))));
  }, [word?.number, word?.direction, sel.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected cell visible: after a move, and when the soft keyboard changes the visible area.
  const scrollSelectedIntoView = useCallback(() => {
    const el = gridRegion.current?.querySelector<HTMLElement>(`[data-cell="${sel.key}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel.key]);
  useEffect(() => {
    scrollSelectedIntoView();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scrollSelectedIntoView);
    return () => vv?.removeEventListener("resize", scrollSelectedIntoView);
  }, [scrollSelectedIntoView]);

  const selectKey = (key: string) => {
    grid.flush(); // never lose a pending syllable when the student taps elsewhere
    const next = selectCell(words, sel, key);
    if (next) setSel(next);
    grid.focus();
  };
  const selectWord = (w: PlayWord) => {
    grid.flush();
    setSel({ key: firstOpenCell(w, cells, given), direction: w.direction });
    grid.focus();
  };

  // ---- autosave triggers, online/offline, leaving -----------------------------------------------------------
  useEffect(() => {
    const hide = () => {
      grid.flush();
      queue.flushNow({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInputAt.current < 10_000) queue.addActiveMs(1000);
    }, 1000);
    const periodic = setInterval(() => queue.flushNow(), 30_000);
    const online = () => queue.setOnline(true);
    const offline = () => queue.setOnline(false);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.snapshot.state !== "saved") e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", beforeUnload);
    if (!navigator.onLine) queue.setOnline(false);
    return () => {
      clearInterval(tick);
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", beforeUnload);
      queue.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  // ---- team mode: the shared attempt (P3) -----------------------------------------------------------------------
  /** The team completed (by this student's submit or a teammate's): freeze, stop polling, celebrate once in memory. */
  const finishTeam = (celebrate: boolean) => {
    if (finished.current) return;
    finished.current = true;
    queue.freeze(); // K-9: unsent typing is discarded and nothing is sent any more
    pollerRef.current?.dispose();
    pollerRef.current = null;
    setDone(true);
    setMessage(PLAY_TEXT.teamCompleted);
    if (celebrate && !momentShown.current) {
      momentShown.current = true;
      setMoment(true);
    }
  };

  /** Keep the IME controller's copy of the selected word in step with what the board shows (I-5). */
  const mirrorWord = (nextCells: Record<string, string>, nextGiven: Record<string, string>) => {
    const keys = activeKeys.current;
    if (keys.length === 0 || grid.isComposing()) return;
    grid.setWord({
      length: keys.length,
      selected: Math.max(0, keys.indexOf(selKeyRef.current)),
      cells: keys.map((k) => nextCells[k] ?? nextGiven[k] ?? ""),
      locked: keys.map((k) => Boolean(nextGiven[k])),
    });
  };

  const applyTeamState = (s: TeamState): ApplyResult => {
    if (finished.current) return "applied";
    const d = decidePoll({
      state: s,
      unconfirmed: queue.unconfirmed(),
      composing: grid.isComposing() ? activeKeys.current : [], // K-2
      current: cellsRef.current,
      previous: snapshot.current,
      acknowledged: queue.snapshot.revision,
    });
    if (d.ignored) {
      // read before this student's own save landed: apply nothing (no rollback, no notice); a completion still counts.
      // "skipped": the poller asks for the whole grid at once.
      if (d.completed) finishTeam(true);
      return applyResultOf(d);
    }
    teamRevision.current = Math.max(teamRevision.current, d.revision);
    setTeacherCallOpen(d.helpOpen);
    setLimits((l) => teamLimits(l, d.used));
    if (d.grid) {
      const g = d.grid;
      for (const k of g.discard) queue.discard(k); // K-5
      snapshot.current = g.snapshot;
      cellsRef.current = g.cells;
      givenRef.current = g.given;
      setCells(g.cells); // K-1
      setGiven(g.given);
      setMarks((prev) => {
        const out = { ...prev };
        for (const k of g.changedKeys) delete out[k];
        return out;
      });
      if (g.teammateChanged) setNotice((n) => ({ text: PLAY_TEXT.teammateChanged, stamp: n.stamp + 1 })); // K-4, D9
      mirrorWord(g.cells, g.given);
      // "partial": cells were held for the open composition; resync when it ends (onSettled)
      if (g.held.length > 0) resyncNeeded.current = true;
    }
    if (d.completed) finishTeam(true);
    return applyResultOf(d);
  };
  const applyRef = useRef(applyTeamState);
  applyRef.current = applyTeamState;

  useEffect(() => {
    if (!team || payload.readonly || payload.attempt.status === "completed") return;
    const poller = new TeamPoller({
      fetchState: makeTeamStateFetcher(assignmentId),
      onState: (s) => applyRef.current(s),
      onStop: (code) => setMessage(playMessage(code)),
      onHealth: setSyncDegraded,
      // null: the first poll returns the whole grid, so later teammate changes can be told apart (K-4)
      initialKnown: null,
    });
    pollerRef.current = poller;
    poller.start();
    const onVisibility = () => poller.setVisible(document.visibilityState === "visible");
    // K-10: back online, save first, then poll
    const online = () => void queue.idle().then(() => poller.setOnline(true));
    const offline = () => poller.setOnline(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) poller.setOnline(false);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      poller.dispose();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  // K-9: a save refused as read-only in team mode usually means a teammate just completed: look at once.
  useEffect(() => {
    if (team && save.blocked === "READONLY" && !finished.current) void pollerRef.current?.pollNow();
  }, [team, save.blocked]);

  // The wait before the next teacher call counts down from the server's own number of seconds.
  useEffect(() => {
    if (callWaitUntil === null) return;
    const tick = () => {
      const left = Math.ceil((callWaitUntil - Date.now()) / 1000);
      if (left <= 0) {
        setCallWaitUntil(null);
        setCallWaitLeft(null);
      } else setCallWaitLeft(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [callWaitUntil]);

  const doCallTeacher = async () => {
    if (!team || finished.current || readOnly) return;
    const r = await callPlay<HelpCall>(assignmentId, "help", {});
    if (r.ok) {
      setTeacherCallOpen(true);
      setMessage(PLAY_TEXT.callTeacherSent);
      return;
    }
    if (r.kind === "rejected" && r.code === "HELP_COOLDOWN") {
      // from the server's seconds only; a later refusal replaces the earlier deadline (R2 H)
      const until = teacherCallDeadline(Date.now(), r.seconds);
      if (until !== null) setCallWaitUntil(until);
    }
    fail(r);
  };

  // ---- tools: they work on SAVED state at the confirmed revision -------------------------------------------------
  const savedRevision = async (): Promise<number | null> => {
    grid.flush();
    const saved = await queue.idle();
    if (!saved) {
      const b = queue.snapshot.blocked;
      setMessage(b ? blockedText(b) : `${PLAY_TEXT.saveOffline}. ${PLAY_TEXT.saveOfflineHelp}`);
      return null;
    }
    // I-7, team mode: teammates move the shared revision too; the newest one known (own save or team-state) is current
    return team ? Math.max(queue.snapshot.revision, teamRevision.current) : queue.snapshot.revision;
  };

  const fail = (r: Extract<ApiResult<unknown>, { ok: false }>) => {
    if (r.kind === "offline") {
      setMessage(`${PLAY_TEXT.saveOffline}. ${PLAY_TEXT.saveOfflineHelp}`);
      return;
    }
    if (r.code === "STALE" && team) {
      // I-6: never reload a shared board; a teammate is typing
      setMessage(PLAY_TEXT.checkBusy);
      void pollerRef.current?.pollNow();
      return;
    }
    if (r.code === "STALE") {
      setMessage(playMessage("STALE"));
      setTimeout(() => window.location.reload(), 1200);
      return;
    }
    setMessage(playMessage(r.code as PlayErrorCode | null, r.seconds));
  };

  const doCheck = async (scope: "cell" | "word" | "puzzle") => {
    if (finished.current) return;
    const rev = await savedRevision();
    if (rev === null) return;
    const keys = scope === "cell" ? [sel.key] : scope === "word" && word ? wordCells(word) : [];
    // K-6, P3-D6: in team mode a STALE check polls and retries exactly once; individual mode does not retry
    const r = await checkWithOneRetry({
      team: team !== null,
      check: (baseRevision) =>
        callPlay<{ results: CheckResult[]; checksRemaining: number | null }>(assignmentId, "check", { scope, keys, baseRevision }),
      firstRevision: rev,
      pollNow: async () => {
        await pollerRef.current?.pollNow();
      },
      nextRevision: savedRevision,
      stillOpen: () => !finished.current,
    });
    if (!r.ok && r.kind === "busy") return setMessage(PLAY_TEXT.checkBusy);
    if (!r.ok && r.kind === "skipped") return;
    if (!r.ok) return fail(r);
    setMarks((prev) => ({ ...prev, ...Object.fromEntries(r.data.results.map((x) => [x.key, x.status])) }));
    setLimits((l) => ({ ...l, checksRemaining: r.data.checksRemaining }));
    const wrong = r.data.results.filter((x) => x.status === "wrong").length;
    setMessage(wrong === 0 ? "확인했어요. 지금까지 쓴 칸은 모두 맞아요." : `다시 볼 칸이 ${wrong}개 있어요.`);
  };

  const doReveal = async () => {
    if (finished.current) return;
    if (given[sel.key]) return setMessage(PLAY_ERROR_MESSAGES.LOCKED_CELL);
    if (!window.confirm(`이 칸의 글자를 알려 줄까요? 남은 횟수 ${limits.revealsRemaining}번`)) return;
    const rev = await savedRevision();
    if (rev === null) return;
    const r = await callPlay<{ key: string; char: string; revealsRemaining: number }>(assignmentId, "reveal", { key: sel.key, baseRevision: rev });
    if (!r.ok) return fail(r);
    queue.discard(r.data.key); // the server already holds this cell
    setGiven((g) => ({ ...g, [r.data.key]: r.data.char }));
    setCells((c) => {
      const next = { ...c };
      delete next[r.data.key];
      return next;
    });
    setLimits((l) => ({ ...l, revealsRemaining: r.data.revealsRemaining }));
    setMessage("글자 하나를 알려 줬어요.");
    if (word) {
      const keys = wordCells(word);
      grid.setWord({
        length: keys.length,
        selected: Math.max(0, keys.indexOf(sel.key)),
        cells: keys.map((k) => (k === r.data.key ? r.data.char : (cells[k] ?? given[k] ?? ""))),
        locked: keys.map((k) => Boolean(given[k]) || k === r.data.key),
      });
    }
  };

  const doChosung = async () => {
    if (!word || finished.current) return;
    const r = await callPlay<{ chosung: string }>(assignmentId, "chosung", { number: word.number, direction: word.direction });
    if (!r.ok) return fail(r);
    setChosungHints((c) => ({ ...c, [`${word.number}${word.direction}`]: r.data.chosung }));
    setMessage("초성을 보여 줬어요.");
  };

  const doSubmit = async () => {
    if (finished.current) return;
    const rev = await savedRevision();
    if (rev === null) return;
    const r = await callPlay<SubmitResult>(assignmentId, "submit", { baseRevision: rev });
    if (!r.ok) return fail(r);
    if (r.data.result === "completed") {
      if (team) {
        // the whole team is done: same path as a completion seen by polling, celebrated once
        finishTeam(r.data.justCompleted);
        if (!r.data.justCompleted) window.location.assign(resultHref);
        return;
      }
      setDone(true);
      setMessage("");
      if (r.data.justCompleted) setMoment(true);
      else window.location.assign(resultHref);
    } else if (r.data.result === "incomplete") setMessage(PLAY_TEXT.incompleteCell(r.data.empty));
    else setMessage(r.data.wrongCells !== undefined ? PLAY_TEXT.wrongCount(r.data.wrongCells) : PLAY_TEXT.wrongSome);
  };

  // ---- word entry: the second input path (also for keyboards where the grid input misbehaves) ---------------------
  const enterWord = () => {
    if (!word || readOnly) return;
    const keys = wordCells(word);
    const chars = Array.from(normalizeTyped(wordText));
    const bad = chars.find((c) => !isValidCellChar(c, puzzle.inputMode));
    if (bad !== undefined) return setMessage(isLoneJamo(bad) ? PLAY_ERROR_MESSAGES.BAD_CHAR : PLAY_TEXT.invalidChar(puzzle.inputMode));
    const open = keys.filter((k) => !given[k]);
    const writes = chars.slice(0, open.length).map((c, i) => [open[i], c] as const);
    setCells((prev) => ({ ...prev, ...Object.fromEntries(writes) }));
    setMarks((prev) => {
      const next = { ...prev };
      for (const [k] of writes) delete next[k];
      return next;
    });
    for (const [k, c] of writes) queue.setCell(k, c);
    lastInputAt.current = Date.now();
    setWordText("");
  };

  // ---- keys the controller does not own (Tab, up/down) ---------------------------------------------------------
  const onBoardKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (grid.isComposing() || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Tab") {
      e.preventDefault();
      grid.flush();
      const next = stepClue(words, sel, e.shiftKey ? -1 : 1);
      if (next) setSel(next);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      grid.flush();
      setSel(moveSelection(words, sel, e.key === "ArrowUp" ? "up" : "down"));
    }
  };

  const idx = word ? Math.max(0, wordCells(word).indexOf(sel.key)) : 0;
  const inputName = word ? `${word.direction === "across" ? "가로" : "세로"} ${word.number}번 낱말, ${idx + 1}번째 칸 글자 쓰기` : "글자 쓰기";

  return (
    <main className="mx-auto max-w-6xl px-3 pb-40 pt-3 sm:px-4 sm:pb-28 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href="/student/crosswords" className="inline-flex min-h-11 items-center text-sm underline">
            ← 퍼즐 목록
          </Link>
          <h1 className="text-xl font-semibold">{puzzle.title}</h1>
          {team ? <p className="text-sm font-medium text-slate-800">{PLAY_TEXT.teamHeading(team.label, team.memberCount)}</p> : null}
        </div>
        <SaveIndicator snapshot={save} />
      </header>

      {readOnly && !done ? (
        <p role="alert" className="mt-2 rounded border border-slate-600 bg-slate-100 px-3 py-2 text-sm">
          {PLAY_TEXT.closedBanner} 쓴 글자는 그대로 볼 수 있어요.
        </p>
      ) : null}

      {moment ? (
        <div className="mt-3">
          <CompletionMoment resultHref={resultHref} />
        </div>
      ) : null}

      {/* the clue of the selected word, pinned so it stays in view while typing */}
      <div className="sticky top-0 z-10 mt-3 border-b border-slate-300 bg-white/95 py-2">
        {word ? (
          <p className="text-base">
            <strong>
              {word.direction === "across" ? "가로" : "세로"} {word.number}번
            </strong>{" "}
            · {word.length}글자 · {word.clue}
          </p>
        ) : null}
      </div>

      <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="min-w-0">
          <div ref={gridRegion} role="region" aria-label="퍼즐 판 (가로로 밀어서 볼 수 있어요)" tabIndex={0} className="play-grid-box max-h-[55dvh] overflow-auto rounded lg:max-h-[calc(100dvh-13rem)]">
            <PlayGrid
              label={`${puzzle.title} 퍼즐 판`}
              rows={puzzle.rows}
              cols={puzzle.cols}
              words={words}
              cells={cells}
              given={given}
              pending={pending}
              marks={marks}
              selection={sel}
              onSelectCell={readOnly ? undefined : selectKey}
            />
          </div>

        </div>

        <div className="mt-4 min-w-0 lg:sticky lg:top-14 lg:mt-0 lg:self-start">
          <p className="sr-only" id="play-input-help">
            칸을 누른 뒤 글자를 쓰세요. 화살표 키로 칸을 옮기고, 탭 키로 다음 단서로 갑니다. 아래 낱말로 입력에서 낱말 전체를 한 번에 쓸 수도 있어요.
          </p>
          <label className="mt-4 block text-sm font-medium">
            글자 쓰기
            <input
              {...grid.inputProps}
              onKeyDown={(e) => {
                onBoardKeyDown(e);
                if (!e.defaultPrevented) grid.inputProps.onKeyDown(e);
              }}
              disabled={readOnly}
              aria-label={inputName}
              aria-describedby="play-input-help"
              lang="ko"
              className="play-input mt-1 block min-h-12 w-full rounded border-2 border-slate-600 p-2"
              style={{ fontSize: 16 }}
            />
          </label>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enterWord();
            }}
            className="mt-3 flex items-end gap-2"
          >
            <label className="min-w-0 flex-1 text-sm font-medium">
              낱말로 입력
              <input
                value={wordText}
                onChange={(e) => setWordText(e.target.value)}
                disabled={readOnly}
                lang="ko"
                autoComplete="off"
                className="play-input mt-1 block min-h-12 w-full rounded border border-slate-600 p-2"
                style={{ fontSize: 16 }}
              />
            </label>
            <button type="submit" disabled={readOnly || !word} className="min-h-12 rounded border border-slate-600 px-4 font-medium disabled:opacity-60">
              넣기
            </button>
          </form>

          <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm">
            {message}
          </p>
          {team ? <TeamNotice text={notice.text} stamp={notice.stamp} /> : null}
          {team ? <TeamSyncNotice degraded={syncDegraded} text={PLAY_TEXT.teamSyncDegraded} /> : null}
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        <aside aria-label="단서" className="mt-6 lg:max-h-[calc(100dvh-24rem)] lg:overflow-auto">
          <PlayClues words={words} current={word} chosung={chosungHints} onSelectWord={readOnly ? undefined : selectWord} />
          <details className="mt-4 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">키보드 사용법</summary>
            <ul className="list-disc space-y-1 pl-5">
              <li>글자를 쓰면 다음 칸으로 넘어가요.</li>
              <li>← → 로 칸을 옮기고, ↑ ↓ 로 위아래 칸으로 가요.</li>
              <li>Tab 은 다음 단서, Shift+Tab 은 이전 단서예요.</li>
              <li>Backspace 는 지우고 앞 칸으로 돌아가요. 글자를 만드는 중에는 그 글자를 고쳐요.</li>
            </ul>
          </details>
        </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-400 bg-white/95 px-3 py-2 sm:px-4">
        <div className="mx-auto max-w-6xl">
          <PlayTools
            limits={limits}
            disabled={readOnly}
            canSubmit={allFilled(words, cells, given)}
            onCheck={doCheck}
            onReveal={doReveal}
            onChosung={doChosung}
            onSubmit={doSubmit}
            teacherCall={
              team ? { open: teacherCallOpen, waitSeconds: callWaitLeft, onCall: () => void doCallTeacher() } : undefined
            }
          />
        </div>
      </div>

      {traceOn ? (
        <ImeTracePanel
          trace={trace}
          count={traceCount}
          onClear={() => {
            trace.clear();
            setTraceCount(0);
          }}
        />
      ) : null}
    </main>
  );
}
