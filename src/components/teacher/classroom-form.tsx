"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createClassroomAction,
  updateClassroomAction,
  type ClassroomActionState,
} from "@/features/classrooms/actions";

type Props =
  | { mode: "create" }
  | { mode: "edit"; classroomId: string; defaultName: string; disabled?: boolean };

const initialState: ClassroomActionState = { ok: false };

export function ClassroomForm(props: Props) {
  const router = useRouter();
  const action = props.mode === "create" ? createClassroomAction : updateClassroomAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!state.ok) return;
    if (props.mode === "create" && state.classroomId) {
      router.push(`/teacher/classrooms/${state.classroomId}`);
    } else {
      router.refresh();
    }
  }, [state, props.mode, router]);

  const disabled = props.mode === "edit" && props.disabled;

  return (
    <form action={formAction} className="space-y-4">
      {props.mode === "edit" ? (
        <input type="hidden" name="classroomId" value={props.classroomId} />
      ) : null}
      <div>
        <label htmlFor="classroomName" className="block text-sm font-medium">
          학급 이름
        </label>
        <input
          id="classroomName"
          name="name"
          required
          maxLength={80}
          disabled={disabled}
          defaultValue={props.mode === "edit" ? props.defaultName : ""}
          aria-describedby="classroomNameHelp"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p id="classroomNameHelp" className="mt-1 text-xs text-slate-600">
          최대 80자. 학급 코드는 자동으로 만들어지며 바꿀 수 없습니다.
        </p>
      </div>

      {!state.ok && state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok && props.mode === "edit" ? (
        <p role="status" className="text-sm text-green-700">
          저장했습니다.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "저장 중..." : props.mode === "create" ? "학급 만들기" : "저장"}
      </button>
    </form>
  );
}
