"use client";

import { useActionState } from "react";
import {
  createStudentAction,
  type CreateStudentState,
} from "@/features/auth/student-actions";
import { CredentialCard } from "./credential-card";

const initialState: CreateStudentState = { ok: false };

export function CreateStudentForm() {
  const [state, formAction, pending] = useActionState(createStudentAction, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="studentName" className="block text-sm font-medium">
            이름
          </label>
          <input
            id="studentName"
            name="studentName"
            required
            maxLength={80}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="studentNo" className="block text-sm font-medium">
            학번
          </label>
          <input
            id="studentNo"
            name="studentNo"
            required
            maxLength={40}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="grade" className="block text-sm font-medium">
            학년
          </label>
          <input
            id="grade"
            name="grade"
            required
            maxLength={20}
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
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? "생성 중..." : "학생 계정 만들기"}
        </button>
      </form>

      {state.ok && state.credential ? <CredentialCard credential={state.credential} /> : null}
    </div>
  );
}
