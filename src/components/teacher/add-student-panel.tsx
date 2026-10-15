"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addStudentAction, type EnrollmentActionState } from "@/features/enrollments/actions";

type Candidate = { studentId: string; studentNo: string; grade: string; displayName: string };

type Props = { classroomId: string; candidates: Candidate[]; disabled: boolean };

const initialState: EnrollmentActionState = { ok: false };

export function AddStudentPanel({ classroomId, candidates, disabled }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [state, formAction, pending] = useActionState(addStudentAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => `${c.displayName} ${c.studentNo} ${c.grade}`.toLowerCase().includes(q));
  }, [candidates, filter]);

  return (
    <section aria-labelledby="add-student-heading" className="space-y-3">
      <h2 id="add-student-heading" className="text-lg font-semibold">
        학생 추가
      </h2>
      <p className="text-sm text-slate-600">
        같은 학교 학생 중 이 학급에 등록되지 않은 학생을 추가합니다. 이전에 제외한 학생은 다시 등록됩니다.
      </p>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="classroomId" value={classroomId} />
        <div>
          <label htmlFor="studentFilter" className="block text-sm font-medium">
            학생 검색 (이름 · 학번 · 학년)
          </label>
          <input
            id="studentFilter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </div>
        <div>
          <label htmlFor="studentSelect" className="block text-sm font-medium">
            추가할 학생
          </label>
          <div className="mt-1 flex gap-2">
            <select
              id="studentSelect"
              name="studentId"
              required
              defaultValue=""
              disabled={disabled || visible.length === 0}
              aria-describedby="studentCount"
              className="w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            >
              <option value="" disabled>
                {visible.length === 0 ? "추가할 수 있는 학생이 없습니다" : "학생을 선택하세요"}
              </option>
              {visible.map((c) => (
                <option key={c.studentId} value={c.studentId}>
                  {c.grade}학년 · {c.studentNo} · {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending || disabled || visible.length === 0}
              className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {pending ? "추가 중..." : "추가"}
            </button>
          </div>
          <p id="studentCount" role="status" className="mt-1 text-xs text-slate-600">
            {visible.length}명 표시 중
          </p>
        </div>
        {!state.ok && state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
