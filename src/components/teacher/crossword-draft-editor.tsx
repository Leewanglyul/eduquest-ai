"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCrosswordDraftAction } from "@/features/crossword/review/actions";
import { DIRECTION_LABEL, type ViewWord } from "@/features/crossword/review/view-model";
import { useCrosswordAction } from "./use-crossword-action";
import { BTN_PRIMARY, INPUT } from "./crossword-ui";

type Props = { puzzleId: string; title: string; words: readonly ViewWord[] };

const keyOf = (w: Pick<ViewWord, "number" | "direction">) => `${w.number}-${w.direction}`;

/**
 * Draft only: the title and the wording of each clue. Words, positions and answers cannot be edited here.
 * One labelled field per clue (not a table), so it reads well on a 360px phone and with a screen reader.
 */
export function CrosswordDraftEditor({ puzzleId, title, words }: Props) {
  const router = useRouter();
  const [name, setName] = useState(title);
  const [clues, setClues] = useState<Record<string, string>>(() =>
    Object.fromEntries(words.map((w) => [keyOf(w), w.clue])),
  );
  const update = useCrosswordAction(updateCrosswordDraftAction);

  useEffect(() => {
    if (update.state?.ok) router.refresh();
  }, [update.state, router]);

  const changedClues = words.filter((w) => clues[keyOf(w)] !== w.clue);
  const titleChanged = name.trim() !== title;
  const dirty = titleChanged || changedClues.length > 0;

  // Unsaved edits are not lost silently when the teacher closes the tab or navigates away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.submit({
      puzzleId,
      ...(titleChanged ? { title: name } : {}),
      ...(changedClues.length > 0
        ? {
            clues: changedClues.map((w) => ({
              number: w.number,
              direction: w.direction,
              clue: clues[keyOf(w)],
            })),
          }
        : {}),
    });
  }

  const sorted = [...words].sort(
    (a, b) => a.number - b.number || a.direction.localeCompare(b.direction),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="초안 수정">
      <div>
        <label htmlFor="draftTitle" className="block text-sm font-medium">
          퍼즐 이름
        </label>
        <input
          id="draftTitle"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className={`mt-1 ${INPUT}`}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">힌트 문장</legend>
        <p id="clueHelp" className="text-xs text-slate-600">
          힌트 문장만 고칠 수 있습니다 (1~200자). 정답과 위치는 바꿀 수 없습니다. 학생 이름, 학번 등
          개인정보는 넣지 마세요.
        </p>
        <ul className="space-y-3">
          {sorted.map((w) => {
            const id = `clue-${keyOf(w)}`;
            return (
              <li key={keyOf(w)}>
                <label htmlFor={id} className="block text-sm">
                  <span className="font-medium">
                    {w.number}번 {DIRECTION_LABEL[w.direction]}
                  </span>
                  <span className="ml-2 text-slate-600">정답: {w.answer}</span>
                </label>
                <input
                  id={id}
                  value={clues[keyOf(w)] ?? ""}
                  onChange={(e) => setClues({ ...clues, [keyOf(w)]: e.target.value })}
                  maxLength={200}
                  aria-describedby="clueHelp"
                  className={`mt-1 ${INPUT}`}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>

      {update.state && !update.state.ok ? (
        <p role="alert" className="text-sm text-red-700">
          {update.state.error}
        </p>
      ) : null}
      {update.state?.ok && !dirty ? (
        <p role="status" className="text-sm text-green-800">
          저장했습니다.
        </p>
      ) : null}
      {dirty ? <p className="text-xs text-slate-600">저장하지 않은 변경 사항이 있습니다.</p> : null}
      <button type="submit" disabled={update.pending || !dirty} className={BTN_PRIMARY}>
        {update.pending ? "저장 중..." : "변경 사항 저장"}
      </button>
    </form>
  );
}
