"use client";

/**
 * The bare play board of M2-2.4a F3: just enough to exercise the whole stack on the target devices (G.5). Nothing
 * here is styled for students yet; the list, result, completion moment and the final layout are M2-2.4b.
 *
 * What it does: shows the grid, takes Korean input through ONE uncontrolled <input> (use-grid-input), keeps a word-entry
 * field as the second input path, autosaves through the SaveQueue, shows the save state (saving / saved / offline,
 * PM SP-3), and offers the tools the puzzle allows. The key never reaches this component: it holds the student's own
 * cells and the cells they were given, nothing else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allFilled,
  firstOpenCell,
  isValidCellChar,
  moveSelection,
  normalizeTyped,
  selectCell,
  sortedWords,
  stepClue,
  wordCells,
  wordForSelection,
  wordsAt,
  type Selection,
} from "@/features/crossword/play/cells";
import type { Intent } from "@/features/crossword/play/ime/controller";
import { PLAY_ERROR_MESSAGES, PLAY_TEXT, playMessage } from "@/features/crossword/play/messages";
import type { CheckResult, CheckStatus, PlayErrorCode, PlayLimits, PlayPayload, PlayWord, SubmitResult } from "@/features/crossword/play/types";
import { ImeTrace } from "./ime-trace";
import { callPlay, makeSaveSender, type ApiResult } from "./play-api";
import { SaveQueue, type QueueSnapshot } from "./save-queue";
import { useGridInput } from "./use-grid-input";

const MARK_TEXT: Record<CheckStatus, string> = { ok: "맞음", wrong: "다시 보기", empty: "비어 있음" };

/** Why saving stopped: the real reason when the server named one, never a guess that it was closed. */
function blockedText(code: PlayErrorCode | "UNKNOWN"): string {
  if (code === "UNKNOWN") return PLAY_TEXT.blockedUnknown;
  if (code === "READONLY" || code === "CLOSED") return PLAY_TEXT.closedBanner;
  return playMessage(code);
}

export function CrosswordPlayBoard({ payload }: { payload: PlayPayload }) {
  const { assignmentId, puzzle } = payload;
  const words = puzzle.words;

  const [cells, setCells] = useState<Record<string, string>>(payload.cells);
  const [given, setGiven] = useState<Record<string, string>>(payload.given);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, CheckStatus>>({});
  const [sel, setSel] = useState<Selection>(() => {
    const first = sortedWords(words)[0];
    return first ? { key: firstOpenCell(first, payload.cells, payload.given), direction: first.direction } : { key: "0,0", direction: "across" };
  });
  const [limits, setLimits] = useState<PlayLimits>(payload.limits);
  const [chosung, setChosung] = useState<Record<string, string>>({});
  const [done, setDone] = useState(payload.attempt.status === "completed");
  const [message, setMessage] = useState("");
  const [save, setSave] = useState<QueueSnapshot>({ state: "saved", revision: payload.attempt.revision, blocked: null, pendingCells: 0 });
  const [wordText, setWordText] = useState("");

  const readOnly = payload.readonly || done || save.blocked !== null;
  const activeKeys = useRef<string[]>([]);
  const dirRef = useRef(sel.direction);
  dirRef.current = sel.direction;
  const lastInputAt = useRef(0);

  const queue = useMemo(
    () =>
      new SaveQueue({
        send: makeSaveSender(assignmentId),
        onChange: setSave,
        initialRevision: payload.attempt.revision,
      }),
    [assignmentId, payload.attempt.revision],
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
          setMessage(it.reason === "jamo" ? PLAY_ERROR_MESSAGES.BAD_CHAR : "그 글자는 쓸 수 없어요.");
        }
      }
    },
    [queue],
  );

  // Device validation aid: open the board with ?imetrace=1 to record the IME events and download them (G.5, G.6).
  const [traceOn, setTraceOn] = useState(false);
  const trace = useMemo(() => new ImeTrace(), []);
  const [traceCount, setTraceCount] = useState(0);
  const [traceDevice, setTraceDevice] = useState("");
  const [traceKeyboard, setTraceKeyboard] = useState("");
  const [tracePrediction, setTracePrediction] = useState(false);
  const [traceNote, setTraceNote] = useState("");
  useEffect(() => {
    setTraceOn(new URLSearchParams(window.location.search).get("imetrace") === "1");
  }, []);
  const grid = useGridInput(applyIntents, traceOn ? (e) => { trace.record(e); setTraceCount(trace.size); } : undefined);
  const downloadTrace = () => {
    const fixture = trace.toFixture({
      device: traceDevice || "unnamed device",
      keyboardApp: traceKeyboard,
      predictionStrip: tracePrediction,
      orientation: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? "landscape" : "portrait"),
      viewport: [innerWidth, innerHeight],
      userAgent: navigator.userAgent,
      note: traceNote,
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(fixture)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ime-board-${(traceDevice || "device").replace(/[^w가-힣]+/g, "_")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    // cells/given are read for the mirror only when the word or the selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.number, word?.direction, sel.key, traceOn]);

  const selectKey = (key: string) => {
    grid.flush(); // never lose a pending syllable when the student taps elsewhere
    const next = selectCell(words, sel, key);
    if (next) setSel(next);
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

  // ---- tools: they work on SAVED state at the confirmed revision -------------------------------------------------
  const savedRevision = async (): Promise<number | null> => {
    grid.flush();
    const saved = await queue.idle();
    if (!saved) {
      const b = queue.snapshot.blocked;
      setMessage(b ? blockedText(b) : `${PLAY_TEXT.saveOffline}. ${PLAY_TEXT.saveOfflineHelp}`);
      return null;
    }
    return queue.snapshot.revision;
  };

  const fail = (r: Extract<ApiResult<unknown>, { ok: false }>) => {
    if (r.kind === "offline") {
      setMessage(`${PLAY_TEXT.saveOffline}. ${PLAY_TEXT.saveOfflineHelp}`);
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
    const rev = await savedRevision();
    if (rev === null) return;
    const keys = scope === "cell" ? [sel.key] : scope === "word" && word ? wordCells(word) : [];
    const r = await callPlay<{ results: CheckResult[]; checksRemaining: number | null }>(assignmentId, "check", { scope, keys, baseRevision: rev });
    if (!r.ok) return fail(r);
    setMarks((prev) => ({ ...prev, ...Object.fromEntries(r.data.results.map((x) => [x.key, x.status])) }));
    setLimits((l) => ({ ...l, checksRemaining: r.data.checksRemaining }));
    const wrong = r.data.results.filter((x) => x.status === "wrong").length;
    setMessage(wrong === 0 ? "확인했어요. 지금까지 쓴 칸은 모두 맞아요." : `다시 볼 칸이 ${wrong}개 있어요.`);
  };

  const doReveal = async () => {
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
    if (word) grid.setWord({ length: wordCells(word).length, selected: Math.max(0, wordCells(word).indexOf(sel.key)), cells: wordCells(word).map((k) => (k === r.data.key ? r.data.char : cells[k] ?? given[k] ?? "")), locked: wordCells(word).map((k) => Boolean(given[k]) || k === r.data.key) });
  };

  const doChosung = async () => {
    if (!word) return;
    const r = await callPlay<{ chosung: string }>(assignmentId, "chosung", { number: word.number, direction: word.direction });
    if (!r.ok) return fail(r);
    setChosung((c) => ({ ...c, [`${word.number}${word.direction}`]: r.data.chosung }));
    setMessage("초성을 보여 줬어요.");
  };

  const doSubmit = async () => {
    const rev = await savedRevision();
    if (rev === null) return;
    const r = await callPlay<SubmitResult>(assignmentId, "submit", { baseRevision: rev });
    if (!r.ok) return fail(r);
    if (r.data.result === "completed") {
      setDone(true);
      setMessage(PLAY_TEXT.completed);
    } else if (r.data.result === "incomplete") setMessage(PLAY_TEXT.incompleteCell(r.data.empty));
    else setMessage(r.data.wrongCells !== undefined ? PLAY_TEXT.wrongCount(r.data.wrongCells) : PLAY_TEXT.wrongSome);
  };

  // ---- word entry: the second input path (also for keyboards where the grid input misbehaves) ---------------------
  const enterWord = () => {
    if (!word || readOnly) return;
    const keys = wordCells(word);
    const chars = Array.from(normalizeTyped(wordText));
    if (chars.some((c) => !isValidCellChar(c))) return setMessage(PLAY_ERROR_MESSAGES.BAD_CHAR);
    const open = keys.filter((k) => !given[k]);
    const writes = chars.slice(0, open.length).map((c, i) => [open[i], c] as const);
    setCells((prev) => ({ ...prev, ...Object.fromEntries(writes) }));
    for (const [k, c] of writes) queue.setCell(k, c);
    lastInputAt.current = Date.now();
    setWordText("");
  };

  // ---- keys the controller does not own (Tab, Enter, up/down) ---------------------------------------------------
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

  const gridCells = useMemo(() => {
    const set = new Set(words.flatMap(wordCells));
    return set;
  }, [words]);
  const starts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of words) {
      const k = wordCells(w)[0];
      if (!m.has(k)) m.set(k, w.number);
    }
    return m;
  }, [words]);
  const selectedWordKeys = new Set(word ? wordCells(word) : []);

  const across = words.filter((w) => w.direction === "across");
  const down = words.filter((w) => w.direction === "down");
  const anytime = limits.checkMode === "anytime";
  const checksOut = limits.checksAllowed !== null && (limits.checksRemaining ?? 0) <= 0;
  const canCheck = limits.checkMode !== "submitOnly" && limits.checksAllowed !== 0 && !checksOut;

  const saveText = save.state === "saving" ? PLAY_TEXT.saveSaving : save.state === "offline" ? PLAY_TEXT.saveOffline : PLAY_TEXT.saveSaved;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{puzzle.title}</h1>

      {/* PM SP-3: the three save states, for screen readers too */}
      <p role="status" aria-live="polite" data-save-state={save.blocked ? "blocked" : save.state} className="text-sm">
        {save.blocked ? blockedText(save.blocked) : saveText}
        {!save.blocked && save.state === "offline" ? ` ${PLAY_TEXT.saveOfflineHelp}` : ""}
      </p>
      {readOnly && !done ? <p role="alert">{PLAY_TEXT.closedBanner}</p> : null}
      {done ? <p role="status">{PLAY_TEXT.completed}</p> : null}

      <div role="region" aria-label="퍼즐 판" tabIndex={0} className="overflow-auto rounded border border-slate-300 p-2">
        <div role="grid" aria-label={`${puzzle.title} 퍼즐 판`} style={{ display: "grid", gridTemplateColumns: `repeat(${puzzle.cols}, 40px)`, gap: 2 }}>
          {Array.from({ length: puzzle.rows * puzzle.cols }, (_, i) => {
            const r = Math.floor(i / puzzle.cols);
            const c = i % puzzle.cols;
            const key = `${r},${c}`;
            if (!gridCells.has(key)) return <div key={key} role="presentation" style={{ width: 40, height: 40 }} />;
            const letter = pending[key] ?? cells[key] ?? given[key] ?? "";
            const isSel = key === sel.key;
            const inWord = selectedWordKeys.has(key);
            const here = wordsAt(words, key)[0];
            const state = pending[key] ? "조합 중" : given[key] ? "알려 준 칸" : cells[key] ? "입력됨" : "비어 있음";
            const mark = marks[key];
            return (
              <div
                key={key}
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${here ? `${here.direction === "across" ? "가로" : "세로"} ${here.number}번` : ""}, ${state}${mark ? `, ${MARK_TEXT[mark]}` : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault(); // keep focus (and any composition) in the one input
                  selectKey(key);
                }}
                style={{
                  position: "relative", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${isSel ? "#1d4ed8" : "#334155"}`, background: pending[key] ? "#fffbeb" : inWord ? "#eff6ff" : given[key] ? "#f1f5f9" : "#fff",
                  fontSize: 22, textDecoration: pending[key] ? "underline" : undefined, userSelect: "none",
                }}
              >
                {starts.has(key) ? <span style={{ position: "absolute", top: 0, left: 2, fontSize: 9 }}>{starts.get(key)}</span> : null}
                {letter}
                {mark ? <span aria-hidden style={{ position: "absolute", right: 1, bottom: 0, fontSize: 9 }}>{mark === "ok" ? "✓" : mark === "wrong" ? "✗" : "·"}</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      <label className="block text-sm">
        글자 입력 (칸을 누르고 쓰세요)
        <input
          {...grid.inputProps}
          onKeyDown={(e) => {
            onBoardKeyDown(e);
            if (!e.defaultPrevented) grid.inputProps.onKeyDown(e);
          }}
          disabled={readOnly}
          aria-label={word ? `${word.direction === "across" ? "가로" : "세로"} ${word.number}번 낱말 입력` : "글자 입력"}
          className="mt-1 block w-full rounded border border-dashed border-slate-400 p-2"
          style={{ fontSize: 16 }}
          lang="ko"
        />
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enterWord();
        }}
        className="flex gap-2"
      >
        <label className="flex-1 text-sm">
          낱말로 입력
          <input value={wordText} onChange={(e) => setWordText(e.target.value)} disabled={readOnly} className="mt-1 block w-full rounded border border-slate-400 p-2" style={{ fontSize: 16 }} lang="ko" autoComplete="off" />
        </label>
        <button type="submit" disabled={readOnly || !word} className="self-end rounded border border-slate-400 px-3" style={{ minHeight: 44 }}>
          넣기
        </button>
      </form>

      <div className="flex flex-wrap gap-2" role="group" aria-label="도구">
        {anytime ? (
          <>
            <button type="button" disabled={readOnly || !canCheck} onClick={() => doCheck("cell")} className="rounded border px-3" style={{ minHeight: 44 }}>칸 확인</button>
            <button type="button" disabled={readOnly || !canCheck} onClick={() => doCheck("puzzle")} className="rounded border px-3" style={{ minHeight: 44 }}>전체 확인</button>
          </>
        ) : null}
        {limits.checkMode !== "submitOnly" ? (
          <button type="button" disabled={readOnly || !canCheck} onClick={() => doCheck("word")} className="rounded border px-3" style={{ minHeight: 44 }}>
            낱말 확인{limits.checksRemaining !== null ? ` (남은 ${limits.checksRemaining}번)` : ""}
          </button>
        ) : null}
        {limits.revealsAllowed > 0 ? (
          <button type="button" disabled={readOnly || limits.revealsRemaining <= 0} onClick={doReveal} className="rounded border px-3" style={{ minHeight: 44 }}>
            글자 알려주기 (남은 {limits.revealsRemaining}번)
          </button>
        ) : null}
        {limits.chosungAllowed ? (
          <button type="button" disabled={readOnly} onClick={doChosung} className="rounded border px-3" style={{ minHeight: 44 }}>초성 보기</button>
        ) : null}
        <button type="button" disabled={readOnly || !allFilled(words, cells, given)} onClick={doSubmit} className="rounded border bg-slate-800 px-3 text-white" style={{ minHeight: 44 }}>
          제출
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm">{message}</p>

      <section aria-label="단서" className="grid gap-4 sm:grid-cols-2">
        {[
          ["가로", across],
          ["세로", down],
        ].map(([title, list]) => (
          <div key={title as string}>
            <h2 className="font-semibold">{title as string}</h2>
            <ol className="space-y-1 text-sm">
              {(list as PlayWord[]).map((w) => {
                const current = word?.number === w.number && word?.direction === w.direction;
                return (
                  <li key={`${w.number}${w.direction}`} aria-current={current ? "true" : undefined} style={{ fontWeight: current ? 700 : 400 }}>
                    {w.number}. {w.clue} ({w.length}){chosung[`${w.number}${w.direction}`] ? ` · 초성 ${chosung[`${w.number}${w.direction}`]}` : ""}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
      {traceOn ? (
        <section aria-label="IME 기록" className="space-y-2 rounded border border-dashed border-amber-600 p-3 text-sm">
          <h2 className="font-semibold">IME 기록 (기기 점검용 · 시험 계정에서만)</h2>
          <p>입력한 내용이 기록에 들어갑니다. 파일은 이 기기에만 저장되고 어디로도 전송되지 않습니다. 기록된 이벤트 {traceCount}개.</p>
          <label className="block">기기 / 브라우저 (예: S24 / Samsung Internet)
            <input value={traceDevice} onChange={(e) => setTraceDevice(e.target.value)} className="mt-1 block w-full rounded border p-2" style={{ fontSize: 16 }} />
          </label>
          <label className="block">키보드 앱 (삼성 키보드, Gboard, Microsoft IME …)
            <input value={traceKeyboard} onChange={(e) => setTraceKeyboard(e.target.value)} className="mt-1 block w-full rounded border p-2" style={{ fontSize: 16 }} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={tracePrediction} onChange={(e) => setTracePrediction(e.target.checked)} /> 추천 단어 줄(예측) 켜 둠</label>
          <label className="block">메모 (이상한 점)
            <input value={traceNote} onChange={(e) => setTraceNote(e.target.value)} className="mt-1 block w-full rounded border p-2" style={{ fontSize: 16 }} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={downloadTrace} className="rounded border px-3" style={{ minHeight: 44 }}>기록 내려받기 (JSON)</button>
            <button type="button" onClick={() => { trace.clear(); setTraceCount(0); }} className="rounded border px-3" style={{ minHeight: 44 }}>기록 지우기</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
