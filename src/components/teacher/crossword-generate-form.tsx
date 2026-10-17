"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateCrosswordAction,
  regenerateCrosswordAction,
  saveCrosswordDraftAction,
} from "@/features/crossword/review/actions";
import type { PreviewResult, PreviewSuccess } from "@/features/crossword/review/service";
import { computeReviewWarnings, LEVEL_LABEL } from "@/features/crossword/review/view-model";
import { DIFFICULTY_PRESETS } from "@/features/crossword/generator/constants";
import { CrosswordClueLists } from "./crossword-clue-lists";
import { CrosswordGridView } from "./crossword-grid-view";
import { CrosswordWarningPanel } from "./crossword-warning-panel";
import { useCrosswordAction } from "./use-crossword-action";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHECK_BOX,
  CHECK_ROW,
  INPUT,
  ScrollRegion,
} from "./crossword-ui";

type EntryRow = { id: string; answer: string; definition: string };

type Props = {
  setId: string;
  setName: string;
  entries: EntryRow[];
};

type Level = "easy" | "normal" | "hard";

/**
 * Generate -> review -> save as draft. The server generates and keeps only a single-use ticket; saving regenerates the
 * same puzzle from the set (same seed and options), so what is saved is exactly what was previewed.
 */
export function CrosswordGenerateForm({ setId, setName, entries }: Props) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>("normal");
  const [advanced, setAdvanced] = useState(false);
  const [seedText, setSeedText] = useState("");
  const [maskClues, setMaskClues] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(`${setName} 낱말 퍼즐`);
  const [showSolution, setShowSolution] = useState(true);
  // The options that produced the preview on screen: saving must send exactly these.
  const [usedOptions, setUsedOptions] = useState<Record<string, unknown> | null>(null);

  const gen = useCrosswordAction(generateCrosswordAction);
  const regen = useCrosswordAction(regenerateCrosswordAction);
  const save = useCrosswordAction(saveCrosswordDraftAction);

  // The latest result of either action is what is shown; the latest error replaces older ones.
  const [shown, setShown] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // Before the page is interactive a click would submit the form natively and reload the page: keep the button off.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const failureBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gen.state) return;
    if (gen.state.ok) setShown(gen.state.data);
    setError(gen.state.ok ? null : gen.state.error);
  }, [gen.state]);
  useEffect(() => {
    if (!regen.state) return;
    if (regen.state.ok) setShown(regen.state.data);
    setError(regen.state.ok ? null : regen.state.error);
  }, [regen.state]);
  useEffect(() => {
    if (save.state && !save.state.ok) setError(save.state.error);
  }, [save.state]);
  useEffect(() => {
    if (save.state?.ok) router.push(`/teacher/crosswords/${save.state.data.puzzleId}`);
  }, [save.state, router]);

  const preset = DIFFICULTY_PRESETS[level];

  function options(): Record<string, unknown> {
    const o: Record<string, unknown> = { setId, level, maskClues };
    if (excluded.size > 0) o.excludedIds = [...excluded];
    if (pinned.size > 0) o.pinnedIds = [...pinned];
    return o;
  }

  function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (seedTooBig) return;
    const o = options();
    setUsedOptions(o);
    const seed = seedText.trim() === "" ? undefined : Number(seedText);
    gen.submit(seed === undefined ? o : { ...o, seed });
  }

  function onRegenerate() {
    const o = options();
    setUsedOptions(o);
    regen.submit(o);
  }

  const preview: PreviewSuccess | null = shown && shown.ok ? shown : null;
  const failure = shown && !shown.ok ? shown : null;
  const busy = gen.pending || regen.pending || save.pending;
  const seedTooBig = seedText !== "" && Number(seedText) > 0xffffffff;

  // A preview is valid for 15 minutes; after that the ticket is refused, so say so before the teacher tries.
  const expiresAt = preview?.ticket.expiresAt;
  useEffect(() => {
    setExpired(false);
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setExpired(true), ms);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  // Move focus to the new result so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview?.ticket.ticketId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (failure) failureBox.current?.focus();
  }, [failure]);

  // The preview on screen was made with other options than the form shows now.
  const optionsChanged =
    preview !== null &&
    usedOptions !== null &&
    JSON.stringify(usedOptions) !== JSON.stringify(options());
  const announcement =
    gen.pending || regen.pending
      ? "퍼즐을 만드는 중입니다."
      : save.pending
        ? "초안으로 저장하는 중입니다."
        : preview
          ? `미리보기가 준비되었습니다. 단어 ${preview.stats.totalWords}개, ${preview.rows}행 ${preview.cols}열.`
          : failure
            ? failure.message
            : "";

  function onSave() {
    if (!preview || !usedOptions || expired) return;
    save.submit({
      ...usedOptions,
      seed: preview.seed,
      ticketId: preview.ticket.ticketId,
      ticketToken: preview.ticket.ticketToken,
      title,
    });
  }

  function toggle(
    set: Set<string>,
    setter: (s: Set<string>) => void,
    id: string,
    other?: [Set<string>, (s: Set<string>) => void],
  ) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (other && other[0].has(id)) {
        const o = new Set(other[0]);
        o.delete(id);
        other[1](o);
      }
    }
    setter(next);
  }

  const warnings = preview
    ? computeReviewWarnings(preview.words, {
        truncated: preview.truncated,
        unplaced: preview.unplaced.length,
        excluded: preview.excluded.length,
      })
    : [];

  return (
    <div className="space-y-8">
      <form onSubmit={onGenerate} className="space-y-4" aria-label="퍼즐 생성 옵션">
        <fieldset>
          <legend className="text-sm font-medium">난이도</legend>
          <div className="mt-1 flex gap-4">
            {(["easy", "normal", "hard"] as const).map((l) => (
              <label key={l} className={CHECK_ROW}>
                <input
                  type="radio"
                  className={CHECK_BOX}
                  name="level"
                  value={l}
                  checked={level === l}
                  onChange={() => setLevel(l)}
                />{" "}
                {LEVEL_LABEL[l]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {preset.gridSize}×{preset.gridSize} 칸 · 단어 최대 {preset.maxWords}개 · 정답 최대{" "}
            {preset.maxWordLen}글자 · 미리 채워진 칸 약 {preset.prefillPercent}% · 글자 알려주기{" "}
            {preset.revealsPerStudent}회 · 확인{" "}
            {preset.checksAllowed === null ? "제한 없음" : `${preset.checksAllowed}회`}
          </p>
        </fieldset>

        <details
          open={advanced}
          onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            고급 옵션
          </summary>
          <div className="mt-2 space-y-3">
            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                className={CHECK_BOX}
                checked={maskClues}
                onChange={(e) => setMaskClues(e.target.checked)}
              />{" "}
              뜻에 정답이 들어 있으면 ○로 가리기
            </label>
            <div>
              <label htmlFor="seed" className="block text-sm">
                시드 (같은 퍼즐을 다시 찾을 때만 입력)
              </label>
              <input
                id="seed"
                inputMode="numeric"
                pattern="[0-9]*"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value.replace(/\D/g, ""))}
                aria-invalid={seedTooBig}
                aria-describedby={seedTooBig ? "seedError" : undefined}
                className={`mt-1 max-w-48 ${INPUT}`}
              />
              {seedTooBig ? (
                <p id="seedError" role="alert" className="mt-1 text-sm text-red-700">
                  시드는 0부터 4294967295 사이의 숫자여야 합니다.
                </p>
              ) : null}
            </div>
            <ScrollRegion label="단어 고정 및 제외 표">
              <table className="w-full border-collapse text-sm">
                <caption className="mb-1 text-left text-xs text-slate-600">
                  단어를 직접 고정하거나 제외할 수 있습니다.
                </caption>
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th scope="col" className="border border-slate-200 px-2 py-1">
                      정답
                    </th>
                    <th scope="col" className="border border-slate-200 px-2 py-1">
                      뜻
                    </th>
                    <th scope="col" className="border border-slate-200 px-2 py-1">
                      꼭 넣기
                    </th>
                    <th scope="col" className="border border-slate-200 px-2 py-1">
                      제외
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en) => (
                    <tr key={en.id}>
                      <th
                        scope="row"
                        className="border border-slate-200 px-2 py-1 text-left font-normal"
                      >
                        {en.answer}
                      </th>
                      <td className="border border-slate-200 px-2 py-1">{en.definition}</td>
                      <td className="border border-slate-200 px-2 py-1">
                        <input
                          type="checkbox"
                          className={CHECK_BOX}
                          aria-label={`${en.answer} 꼭 넣기`}
                          checked={pinned.has(en.id)}
                          onChange={() => toggle(pinned, setPinned, en.id, [excluded, setExcluded])}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-1">
                        <input
                          type="checkbox"
                          className={CHECK_BOX}
                          aria-label={`${en.answer} 제외`}
                          checked={excluded.has(en.id)}
                          onChange={() => toggle(excluded, setExcluded, en.id, [pinned, setPinned])}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        </details>

        <button type="submit" disabled={busy || !ready} className={BTN_PRIMARY}>
          {gen.pending ? "생성 중..." : "생성"}
        </button>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {failure ? (
        <div ref={failureBox} tabIndex={-1} className="space-y-3 outline-none">
          <p role="alert" className="rounded-md border border-red-700 p-3 text-sm text-red-800">
            {failure.message}
          </p>
          <CrosswordWarningPanel
            warnings={[]}
            excluded={failure.excluded}
            unplaced={failure.unplaced}
            entryAnswers={failure.entryAnswers}
          />
        </div>
      ) : null}

      {preview ? (
        <section aria-labelledby="preview-title" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="preview-title"
              ref={previewHeading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              미리보기
            </h2>
            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                className={CHECK_BOX}
                checked={showSolution}
                onChange={(e) => setShowSolution(e.target.checked)}
              />{" "}
              정답 보기
            </label>
          </div>
          <CrosswordGridView
            rows={preview.rows}
            cols={preview.cols}
            words={preview.words}
            showSolution={showSolution}
          />
          <CrosswordClueLists words={preview.words} />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-700">단어</dt>
              <dd>
                {preview.stats.totalWords}개 (가로 {preview.stats.across} · 세로{" "}
                {preview.stats.down})
              </dd>
            </div>
            <div>
              <dt className="text-slate-700">겹친 칸</dt>
              <dd>{preview.stats.crossings}개</dd>
            </div>
            <div>
              <dt className="text-slate-700">크기</dt>
              <dd>
                {preview.rows}×{preview.cols}
              </dd>
            </div>
            <div>
              <dt className="text-slate-700">난이도 점수</dt>
              <dd>{preview.difficulty}</dd>
            </div>
            <div>
              <dt className="text-slate-700">시드</dt>
              <dd>{preview.seed}</dd>
            </div>
            <div>
              <dt className="text-slate-700">완성도</dt>
              <dd>{preview.score.quality}/100</dd>
            </div>
          </dl>

          <CrosswordWarningPanel
            warnings={warnings}
            excluded={preview.excluded}
            unplaced={preview.unplaced}
            entryAnswers={preview.entryAnswers}
          />

          <div className="space-y-3 rounded-md border border-slate-300 p-4">
            {expired ? (
              <p role="alert" className="text-sm text-red-700">
                이 미리보기는 15분이 지나 만료되었습니다. 다시 생성해 주세요.
              </p>
            ) : null}
            {optionsChanged ? (
              <p role="status" className="text-sm text-amber-800">
                옵션을 바꾸었습니다. 화면의 미리보기는 이전 옵션으로 만든 것입니다. 저장하면 이전
                옵션 그대로 저장되고, 바꾼 옵션을 반영하려면 다시 생성해 주세요.
              </p>
            ) : null}
            <div>
              <label htmlFor="puzzleTitle" className="block text-sm font-medium">
                퍼즐 이름
              </label>
              <input
                id="puzzleTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
                className={`mt-1 ${INPUT}`}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onRegenerate}
                disabled={busy}
                className={BTN_SECONDARY}
              >
                {regen.pending ? "생성 중..." : "다시 생성"}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || expired || title.trim() === ""}
                className={BTN_PRIMARY}
              >
                {save.pending ? "저장 중..." : "초안으로 저장"}
              </button>
            </div>
            <p className="text-xs text-slate-600">
              다시 생성은 횟수 제한이 없습니다. 저장하기 전에는 아무것도 기록되지 않으며, 미리보기는
              15분 동안 유효합니다.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
