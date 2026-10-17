"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCrosswordDraftAction } from "@/features/crossword/review/actions";
import { DIRECTION_LABEL, type ViewWord } from "@/features/crossword/review/view-model";
import { useCrosswordAction } from "./use-crossword-action";

type Props = { puzzleId: string; title: string; words: readonly ViewWord[] };

const keyOf = (w: Pick<ViewWord, "number" | "direction">) => `${w.number}-${w.direction}`;

/** Draft only: the title and the wording of each clue. Words, positions and answers cannot be edited here. */
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
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <table className="w-full border-collapse text-sm">
        <caption className="mb-1 text-left text-xs text-slate-600">
          힌트 문장만 고칠 수 있습니다 (1~200자).
        </caption>
        <thead>
          <tr className="bg-slate-100 text-left">
            <th scope="col" className="border border-slate-200 px-2 py-1">
              번호
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              정답
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              힌트
            </th>
          </tr>
        </thead>
        <tbody>
          {[...words]
            .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction))
            .map((w) => (
              <tr key={keyOf(w)}>
                <th scope="row" className="border border-slate-200 px-2 py-1 text-left font-normal">
                  {w.number} {DIRECTION_LABEL[w.direction]}
                </th>
                <td className="border border-slate-200 px-2 py-1">{w.answer}</td>
                <td className="border border-slate-200 px-2 py-1">
                  <input
                    aria-label={`${w.number}번 ${DIRECTION_LABEL[w.direction]} 힌트`}
                    value={clues[keyOf(w)] ?? ""}
                    onChange={(e) => setClues({ ...clues, [keyOf(w)]: e.target.value })}
                    maxLength={200}
                    className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {update.state && !update.state.ok ? (
        <p role="alert" className="text-sm text-red-600">
          {update.state.error}
        </p>
      ) : null}
      {update.state?.ok && !dirty ? (
        <p role="status" className="text-sm text-green-700">
          저장했습니다.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={update.pending || !dirty}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {update.pending ? "저장 중..." : "변경 사항 저장"}
      </button>
    </form>
  );
}
