"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { closeCrosswordAssignmentAction } from "@/features/crossword/review/actions";
import type { CrosswordDetail } from "@/features/crossword/review/service";
import { useCrosswordAction } from "./use-crossword-action";

type Props = {
  assignments: CrosswordDetail["assignments"];
  puzzleStatus: "draft" | "published" | "archived";
};

const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "제한 없음");

/** Where the puzzle is given out. Closing an assignment stops the classroom from playing it; the puzzle stays as it is. */
export function CrosswordAssignmentList({ assignments, puzzleStatus }: Props) {
  const router = useRouter();
  const close = useCrosswordAction(closeCrosswordAssignmentAction);

  useEffect(() => {
    if (close.state?.ok) router.refresh();
  }, [close.state, router]);

  if (assignments.length === 0) {
    return (
      <section aria-labelledby="assignments-title">
        <h2 id="assignments-title" className="mb-2 text-base font-semibold">
          배포한 학급
        </h2>
        <p className="text-sm text-slate-600" role="status">
          아직 배포한 학급이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="assignments-title">
      <h2 id="assignments-title" className="mb-2 text-base font-semibold">
        배포한 학급
      </h2>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">배포한 학급</caption>
        <thead>
          <tr className="bg-slate-100 text-left">
            <th scope="col" className="border border-slate-200 px-2 py-1">
              학급
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              상태
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              시작
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              마감
            </th>
            <th scope="col" className="border border-slate-200 px-2 py-1">
              <span className="sr-only">작업</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <th scope="row" className="border border-slate-200 px-2 py-1 text-left font-normal">
                {a.classroomName ?? "(학급)"}
              </th>
              <td className="border border-slate-200 px-2 py-1">
                {a.status === "open" ? "열림" : "닫힘"}
              </td>
              <td className="border border-slate-200 px-2 py-1">{when(a.opensAt)}</td>
              <td className="border border-slate-200 px-2 py-1">{when(a.closesAt)}</td>
              <td className="border border-slate-200 px-2 py-1">
                {a.status === "open" && puzzleStatus === "published" ? (
                  <button
                    type="button"
                    disabled={close.pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 학급의 배포를 닫을까요? 닫은 배포는 다시 열 수 없습니다.",
                        )
                      )
                        close.submit({ id: a.id });
                    }}
                    className="rounded-md border border-slate-900 px-2 py-0.5 text-xs disabled:opacity-50"
                  >
                    배포 닫기
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {close.state && !close.state.ok ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {close.state.error}
        </p>
      ) : null}
    </section>
  );
}
