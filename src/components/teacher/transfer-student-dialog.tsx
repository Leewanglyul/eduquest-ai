"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { transferStudentAction, type EnrollmentActionState } from "@/features/enrollments/actions";

type Target = { classroomId: string; name: string; code: string };

type Props = {
  sourceClassroomId: string;
  studentId: string;
  studentName: string;
  targets: Target[];
  disabled?: boolean;
};

const initialState: EnrollmentActionState = { ok: false };

/** Native <dialog> (modal): focus is trapped and Esc closes it. */
export function TransferStudentDialog({ sourceClassroomId, studentId, studentName, targets, disabled }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const selectId = useId();
  const [state, formAction, pending] = useActionState(transferStudentAction, initialState);

  useEffect(() => {
    if (state.ok) {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={disabled || targets.length === 0}
        aria-label={`${studentName} 다른 학급으로 이동`}
        title={targets.length === 0 ? "이동할 수 있는 다른 학급이 없습니다." : undefined}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        이동
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-md border border-slate-300 p-5 backdrop:bg-black/40"
      >
        <form action={formAction} className="space-y-4">
          <h3 id={titleId} className="text-base font-semibold">
            {studentName} 학급 이동
          </h3>
          <input type="hidden" name="sourceClassroomId" value={sourceClassroomId} />
          <input type="hidden" name="studentId" value={studentId} />
          <div>
            <label htmlFor={selectId} className="block text-sm font-medium">
              이동할 학급
            </label>
            <select
              id={selectId}
              name="targetClassroomId"
              required
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="" disabled>
                학급을 선택하세요
              </option>
              {targets.map((t) => (
                <option key={t.classroomId} value={t.classroomId}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-600">
              원래 학급에서는 제외되고 선택한 학급에 등록됩니다. 두 학급 모두의 담임 또는 공동 담임이어야 합니다.
            </p>
          </div>
          {!state.ok && state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {pending ? "이동 중..." : "이동"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
