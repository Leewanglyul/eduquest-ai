"use client";

import { useEffect, useState } from "react";
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

  // The latest result of either action is what is shown.
  const [shown, setShown] = useState<PreviewResult | null>(null);
  useEffect(() => {
    if (gen.state?.ok) setShown(gen.state.data);
  }, [gen.state]);
  useEffect(() => {
    if (regen.state?.ok) setShown(regen.state.data);
  }, [regen.state]);
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
  const actionError =
    (gen.state && !gen.state.ok ? gen.state.error : null) ??
    (regen.state && !regen.state.ok ? regen.state.error : null) ??
    (save.state && !save.state.ok ? save.state.error : null);

  function onSave() {
    if (!preview || !usedOptions) return;
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
              <label key={l} className="text-sm">
                <input
                  type="radio"
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
            {preset.revealsPerStudent}회
          </p>
        </fieldset>

        <details
          open={advanced}
          onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm font-medium">고급 옵션</summary>
          <div className="mt-2 space-y-3">
            <label className="block text-sm">
              <input
                type="checkbox"
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
                className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
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
                        aria-label={`${en.answer} 꼭 넣기`}
                        checked={pinned.has(en.id)}
                        onChange={() => toggle(pinned, setPinned, en.id, [excluded, setExcluded])}
                      />
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      <input
                        type="checkbox"
                        aria-label={`${en.answer} 제외`}
                        checked={excluded.has(en.id)}
                        onChange={() => toggle(excluded, setExcluded, en.id, [pinned, setPinned])}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {gen.pending ? "생성 중..." : "생성"}
        </button>
      </form>

      {actionError ? (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      {failure ? (
        <div className="space-y-3">
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
            <h2 id="preview-title" className="text-lg font-semibold">
              미리보기
            </h2>
            <label className="text-sm">
              <input
                type="checkbox"
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
              <dt className="text-slate-600">단어</dt>
              <dd>
                {preview.stats.totalWords}개 (가로 {preview.stats.across} · 세로{" "}
                {preview.stats.down})
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">겹친 칸</dt>
              <dd>{preview.stats.crossings}개</dd>
            </div>
            <div>
              <dt className="text-slate-600">크기</dt>
              <dd>
                {preview.rows}×{preview.cols}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">난이도 점수</dt>
              <dd>{preview.difficulty}</dd>
            </div>
            <div>
              <dt className="text-slate-600">시드</dt>
              <dd>{preview.seed}</dd>
            </div>
            <div>
              <dt className="text-slate-600">완성도</dt>
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onRegenerate}
                disabled={busy}
                className="rounded-md border border-slate-900 px-4 py-2 text-sm disabled:opacity-50"
              >
                {regen.pending ? "생성 중..." : "다시 생성"}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || title.trim() === ""}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
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
