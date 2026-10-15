"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { removeStudentAction, type EnrollmentActionState } from "@/features/enrollments/actions";

type Props = { classroomId: string; studentId: string; studentName: string; disabled?: boolean };

const initialState: EnrollmentActionState = { ok: false };

export function RemoveStudentButton({ classroomId, studentId, studentName, disabled }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(removeStudentAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`${studentName} 학생을 이 학급에서 제외할까요? 나중에 다시 추가할 수 있습니다.`)) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="classroomId" value={classroomId} />
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={pending || disabled}
        aria-label={`${studentName} 학급에서 제외`}
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? "처리 중..." : "제외"}
      </button>
      {!state.ok && state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
