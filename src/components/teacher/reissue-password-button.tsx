"use client";

import { useActionState } from "react";
import {
  reissueStudentPasswordAction,
  type ReissueState,
} from "@/features/accounts/reissue-actions";

type Props = { classroomId: string; studentId: string; studentName: string; disabled?: boolean };

const initialState: ReissueState = { ok: false };

/** Minimal: confirm -> new temporary password shown once, student must change it at next login. */
export function ReissuePasswordButton({ classroomId, studentId, studentName, disabled }: Props) {
  const [state, formAction, pending] = useActionState(reissueStudentPasswordAction, initialState);

  return (
    <div className="inline-flex flex-col gap-1">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `${studentName} 학생의 임시 비밀번호를 재발급할까요? 기존 비밀번호와 로그인 상태는 모두 무효가 됩니다.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="classroomId" value={classroomId} />
        <input type="hidden" name="studentId" value={studentId} />
        <button
          type="submit"
          disabled={pending || disabled}
          aria-label={`${studentName} 임시 비밀번호 재발급`}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {pending ? "처리 중..." : "비밀번호 재발급"}
        </button>
      </form>

      {!state.ok && state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}

      {state.ok && state.credential ? (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
          <p className="font-medium">지금 한 번만 표시됩니다. 학생은 로그인 후 비밀번호를 바꿔야 합니다.</p>
          <p>
            아이디 <code className="font-mono">{state.credential.username}</code>
          </p>
          <p>
            임시 비밀번호 <code className="font-mono">{state.credential.temporaryPassword}</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}
