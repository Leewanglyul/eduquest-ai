"use client";

import { useActionState } from "react";
import {
  teacherSignInAction,
  type TeacherAuthFormState,
} from "@/features/auth/teacher-actions";

const initialState: TeacherAuthFormState = {};

export function TeacherSignInForm() {
  const [state, formAction, pending] = useActionState(teacherSignInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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
        {pending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
