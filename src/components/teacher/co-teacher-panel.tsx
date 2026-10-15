"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addCoTeacherAction,
  removeCoTeacherAction,
  type ClassroomActionState,
} from "@/features/classrooms/actions";

type CoTeacher = { teacherId: string; displayName: string };
type Candidate = { id: string; displayName: string };

type Props = {
  classroomId: string;
  coTeachers: CoTeacher[];
  candidates: Candidate[];
  /** Owner (and admin) only; co-teachers get a read-only list. */
  canManage: boolean;
  disabled: boolean;
};

const initialState: ClassroomActionState = { ok: false };

function RemoveButton({ classroomId, teacher, disabled }: { classroomId: string; teacher: CoTeacher; disabled: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(removeCoTeacherAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="classroomId" value={classroomId} />
      <input type="hidden" name="teacherId" value={teacher.teacherId} />
      <button
        type="submit"
        disabled={pending || disabled}
        aria-label={`${teacher.displayName} 공동 담임 해제`}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        해제
      </button>
      {!state.ok && state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function CoTeacherPanel({ classroomId, coTeachers, candidates, canManage, disabled }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addCoTeacherAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <section aria-labelledby="co-teacher-heading" className="space-y-3">
      <h2 id="co-teacher-heading" className="text-lg font-semibold">
        공동 담임
      </h2>
      <p className="text-sm text-slate-600">
        공동 담임은 학급 이름 수정과 학생 명단 관리를 할 수 있습니다. 보관과 공동 담임 관리는 담임만 할 수
        있습니다.
      </p>

      {coTeachers.length === 0 ? (
        <p className="text-sm text-slate-600">등록된 공동 담임이 없습니다.</p>
      ) : (
        <ul aria-label="공동 담임 목록" className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {coTeachers.map((t) => (
            <li key={t.teacherId} className="flex items-center justify-between gap-2 p-2">
              <span>{t.displayName}</span>
              {canManage ? <RemoveButton classroomId={classroomId} teacher={t} disabled={disabled} /> : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="classroomId" value={classroomId} />
          <label htmlFor="coTeacherSelect" className="block text-sm font-medium">
            공동 담임 추가
          </label>
          <div className="flex gap-2">
            <select
              id="coTeacherSelect"
              name="teacherId"
              required
              disabled={disabled || candidates.length === 0}
              defaultValue=""
              className="w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            >
              <option value="" disabled>
                {candidates.length === 0 ? "추가할 수 있는 교사가 없습니다" : "교사를 선택하세요"}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending || disabled || candidates.length === 0}
              className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {pending ? "추가 중..." : "추가"}
            </button>
          </div>
          {!state.ok && state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
