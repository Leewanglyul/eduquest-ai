/**
 * The result screen (doc 08 D.3). Order, following Progress -> Growth -> Achievements:
 *   1. what the student finished: their own grid and the number of words;
 *   2. their own growth: an empty slot in this phase (the view model carries `growth: null`);
 *   3. the help they used, as tools ("도구를 활용했어요"), never as a penalty;
 *   4. what to do next.
 * Nothing here is a score, a rank, a comparison or about another student. A puzzle the class closed before the student
 * finished shows the same layout with the closed notice and no correctness marks.
 */
import Link from "next/link";
import { formatMinutes } from "@/features/crossword/play/labels";
import { PLAY_TEXT, toolsSummary } from "@/features/crossword/play/messages";
import { nextStep, type ResultView } from "@/features/crossword/play/result";
import { PlayGrid } from "./play-grid";

const PRIMARY = "inline-flex min-h-12 items-center justify-center rounded border-2 border-slate-900 bg-slate-900 px-5 py-2 text-base font-semibold text-white";
const SECONDARY = "inline-flex min-h-12 items-center justify-center rounded border-2 border-slate-600 bg-white px-5 py-2 text-base font-medium text-slate-900";

export function CrosswordResult({ view }: { view: ResultView }) {
  const hasOtherPuzzles = view.hasOtherPuzzles;
  const given = Object.fromEntries(view.givenKeys.map((k) => [k, view.letters[k]]));
  const typed = Object.fromEntries(Object.entries(view.letters).filter(([k]) => !view.givenKeys.includes(k)));
  const step = nextStep(view.next, hasOtherPuzzles);
  const time = formatMinutes(view.activeSeconds);
  const finished = view.status === "completed";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-3 py-4 sm:px-4 lg:px-6">
      <header>
        <Link href="/student/crosswords" className="inline-flex min-h-11 items-center text-sm underline">
          ← 퍼즐 목록
        </Link>
        <h1 className="text-2xl font-semibold">{view.title}</h1>
        <p className="mt-1 text-lg font-medium" data-result-status={view.status}>
          {finished ? PLAY_TEXT.completed : PLAY_TEXT.closedBanner}
        </p>
      </header>

      <section aria-labelledby="result-progress" data-slot="progress">
        <h2 id="result-progress" className="text-lg font-semibold">
          {finished ? "내가 푼 퍼즐" : "내가 쓴 글자"}
        </h2>
        <div className="play-grid-box mt-2 overflow-auto rounded" role="region" aria-label="내가 푼 퍼즐 판" tabIndex={0}>
          <PlayGrid label={`${view.title} 내가 푼 퍼즐`} rows={view.rows} cols={view.cols} words={view.words} cells={typed} given={given} />
        </div>
        <p className="mt-2 text-base">
          낱말 {view.wordCount}개{time ? ` · 푼 시간 ${time}` : ""}
        </p>
      </section>

      {view.growth !== null ? <section aria-label="나의 성장" data-slot="growth" /> : null}

      <section aria-labelledby="result-tools" data-slot="tools">
        <h2 id="result-tools" className="text-lg font-semibold">
          도구
        </h2>
        <p className="mt-1 text-base">{toolsSummary(view.tools)}</p>
      </section>

      <nav aria-label="다음에 할 일" className="flex flex-wrap gap-3">
        {step.label === "next" && view.next ? (
          <Link href={step.href} className={PRIMARY}>
            {PLAY_TEXT.nextPuzzle(view.next.title)}
          </Link>
        ) : step.label === "list" ? (
          <Link href={step.href} className={PRIMARY}>
            {PLAY_TEXT.otherPuzzles}
          </Link>
        ) : (
          <Link href={step.href} className={PRIMARY}>
            {PLAY_TEXT.home}
          </Link>
        )}
        {step.label !== "list" && hasOtherPuzzles ? (
          <Link href="/student/crosswords" className={SECONDARY}>
            {PLAY_TEXT.otherPuzzles}
          </Link>
        ) : null}
        {step.label !== "home" ? (
          <Link href="/student" className={SECONDARY}>
            {PLAY_TEXT.home}
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
