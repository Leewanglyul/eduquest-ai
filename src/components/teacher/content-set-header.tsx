"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveContentSetAction,
  renameContentSetAction,
  unarchiveContentSetAction,
  type ContentSetActionState,
} from "@/features/content/sets/actions";

type Props = {
  setId: string;
  title: string;
  archived: boolean;
  /** The linked classroom is archived: nothing can be changed. */
  classroomArchived: boolean;
};

const initial: ContentSetActionState = { ok: false };

/** Rename and archive / restore. Everyone who may manage the set (owner, classroom owner, co-teachers, admin) sees them. */
export function ContentSetHeader({ setId, title, archived, classroomArchived }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [renameState, renameAction, renamePending] = useActionState(renameContentSetAction, initial);
  const [archiveState, archiveAction, archivePending] = useActionState(
    archived ? unarchiveContentSetAction : archiveContentSetAction,
    initial,
  );

  useEffect(() => {
    if (renameState.ok || archiveState.ok) router.refresh();
  }, [renameState, archiveState, router]);

  useEffect(() => {
    if (renameState.ok && renameState.title) setValue(renameState.title);
  }, [renameState]);

  if (classroomArchived) {
    return (
      <p role="status" className="text-sm text-slate-700">
        보관된 학급의 세트입니다. 읽기만 할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!archived ? (
        <form action={renameAction} className="space-y-2">
          <input type="hidden" name="setId" value={setId} />
          <label htmlFor="setTitle" className="block text-sm font-medium">세트 이름</label>
          <div className="flex gap-2">
            <input
              id="setTitle"
              name="title"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={80}
              required
              className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="submit" disabled={renamePending || value.trim() === title} className="rounded-md border border-slate-900 px-3 py-1 text-sm disabled:opacity-50">
              {renamePending ? "저장 중..." : "이름 바꾸기"}
            </button>
          </div>
          {!renameState.ok && renameState.error ? (
            <p role="alert" className="text-sm text-red-600">{renameState.error}</p>
          ) : null}
        </form>
      ) : null}

      <form
        action={archiveAction}
        onSubmit={(e) => {
          if (!archived && !window.confirm("이 세트를 보관할까요? 목록과 퍼즐 만들기에서 보이지 않게 되며, 언제든 되돌릴 수 있습니다.")) {
            e.preventDefault();
          }
        }}
        className="space-y-2"
      >
        <input type="hidden" name="setId" value={setId} />
        <p className="text-sm text-slate-600">
          {archived
            ? "보관된 세트입니다. 보관을 해제하면 다시 수정하고 사용할 수 있습니다."
            : "보관하면 목록에서 사라지고 수정할 수 없습니다. 단어는 지워지지 않으며 언제든 보관을 해제할 수 있습니다."}
        </p>
        {!archiveState.ok && archiveState.error ? (
          <p role="alert" className="text-sm text-red-600">{archiveState.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={archivePending}
          className={archived ? "rounded-md border border-slate-900 px-4 py-2 disabled:opacity-50" : "rounded-md bg-amber-600 px-4 py-2 text-white disabled:opacity-50"}
        >
          {archivePending ? "처리 중..." : archived ? "보관 해제" : "세트 보관"}
        </button>
      </form>
    </div>
  );
}
