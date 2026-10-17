"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateContentEntryAction, type ContentEntryActionState } from "@/features/content/sets/actions";
import { rowIssueMessage } from "@/features/content/import/import-errors";
import { evaluateRow } from "@/features/content/import/row-rules";
import type { ContentEntryView } from "@/features/content/sets/service";

type Props = { entries: ContentEntryView[]; readOnly: boolean };

const initial: ContentEntryActionState = { ok: false };

export function ContentEntryTable({ entries, readOnly }: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-600" role="status">
        이 세트에는 단어가 없습니다.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="mb-2 text-left font-medium">단어 ({entries.length})</caption>
      <thead>
        <tr className="bg-slate-100 text-left">
          <th scope="col" className="border border-slate-200 px-2 py-1">번호</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">용어</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">퍼즐 정답</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">글자 수</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">뜻</th>
          {readOnly ? null : <th scope="col" className="border border-slate-200 px-2 py-1">수정</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) =>
          editing === entry.id ? (
            <EntryEditorRow key={entry.id} entry={entry} onDone={() => setEditing(null)} />
          ) : (
            <tr key={entry.id}>
              <th scope="row" className="border border-slate-200 px-2 py-1 font-normal">{entry.position}</th>
              <td className="border border-slate-200 px-2 py-1">{entry.term}</td>
              <td className="border border-slate-200 px-2 py-1 font-mono">{entry.answer}</td>
              <td className="border border-slate-200 px-2 py-1">{entry.answerLength}</td>
              <td className="border border-slate-200 px-2 py-1">{entry.definition}</td>
              {readOnly ? null : (
                <td className="border border-slate-200 px-2 py-1">
                  <button type="button" onClick={() => setEditing(entry.id)} className="text-sm underline">
                    수정
                  </button>
                </td>
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function EntryEditorRow({ entry, onDone }: { entry: ContentEntryView; onDone: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState(entry.term);
  const [definition, setDefinition] = useState(entry.definition);
  const [state, action, pending] = useActionState(updateContentEntryAction, initial);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  // The same pure rules the server applies, so the teacher sees the puzzle answer before saving.
  const check = evaluateRow({ line: entry.position, term, definition });

  return (
    <tr className="bg-amber-50">
      <th scope="row" className="border border-slate-200 px-2 py-1 font-normal">{entry.position}</th>
      <td colSpan={5} className="border border-slate-200 px-2 py-2">
        <form action={action} className="space-y-2">
          <input type="hidden" name="entryId" value={entry.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              용어
              <input
                name="term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              뜻
              <input
                name="definition"
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
          <p className="text-xs text-slate-700" role="status">
            {check.ok ? (
              <>
                퍼즐 정답: <span className="font-mono">{check.row.answer}</span> ({check.row.answerLength}글자)
                {check.row.warnings.length > 0 ? ` — ${check.row.warnings.map((w) => rowIssueMessage(w)).join(" / ")}` : ""}
              </>
            ) : (
              <span className="text-red-700">{check.errors.map((e) => rowIssueMessage(e.code, e.context)).join(" / ")}</span>
            )}
          </p>
          {!state.ok && state.errors?.length ? (
            <ul role="alert" className="list-disc pl-5 text-sm text-red-600">
              {state.errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !check.ok} className="rounded-md bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
              {pending ? "저장 중..." : "저장"}
            </button>
            <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-3 py-1">
              취소
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
