"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  archiveClassroomAction,
  unarchiveClassroomAction,
  type ClassroomActionState,
} from "@/features/classrooms/actions";

type Props = { classroomId: string; archived: boolean; canArchive: boolean };

const initialState: ClassroomActionState = { ok: false };

/** Owner-only (and admin): archive / unarchive. Co-teachers see an explanatory note instead. */
export function ArchiveControls({ classroomId, archived, canArchive }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    archived ? unarchiveClassroomAction : archiveClassroomAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!canArchive) {
    return (
      <p className="text-sm text-slate-600">학급 보관과 보관 해제는 담임(소유자)만 할 수 있습니다.</p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!archived && !window.confirm("이 학급을 보관할까요? 학생은 보관된 학급을 볼 수 없게 됩니다.")) {
          e.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="classroomId" value={classroomId} />
      <p className="text-sm text-slate-600">
        {archived
          ? "보관된 학급입니다. 보관을 해제하면 다시 수정할 수 있고 학생에게 보입니다."
          : "보관하면 학급을 수정할 수 없고 학생에게 보이지 않습니다. 언제든 해제할 수 있습니다."}
      </p>
      {!state.ok && state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={
          archived
            ? "rounded-md border border-slate-900 px-4 py-2 disabled:opacity-50"
            : "rounded-md bg-amber-600 px-4 py-2 text-white disabled:opacity-50"
        }
      >
        {pending ? "처리 중..." : archived ? "보관 해제" : "학급 보관"}
      </button>
    </form>
  );
}
