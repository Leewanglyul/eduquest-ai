"use client";

import { useActionState } from "react";
import { setStudentPasswordAction, type AuthFormState } from "@/features/auth/student-actions";

const initialState: AuthFormState = {};

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setStudentPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          새 비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium">
          새 비밀번호 확인
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
