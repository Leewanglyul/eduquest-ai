/**
 * The student's puzzle list (doc 08 A.1). One card per assignment, in the order of list.ts. Each card says what the
 * puzzle is, how far the student got (cells filled, never cells correct) and gives one clear action. The state is a
 * word plus an icon, never colour alone. There is no score, no rank and nothing about other students.
 */
import Link from "next/link";
import { LEVEL_LABEL, STATE_LABEL, formatClosing } from "@/features/crossword/play/labels";
import type { PlayableRow } from "@/features/crossword/play/list";

export function CrosswordPlayList({ rows }: { rows: readonly PlayableRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-slate-400 bg-slate-50 p-4 text-base">
        지금 풀 수 있는 퍼즐이 없어요. 선생님이 퍼즐을 열어 주면 여기에 나타나요.
      </p>
    );
  }
  return (
    <ul aria-label="풀 수 있는 퍼즐 목록" className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const label = STATE_LABEL[r.state];
        const finished = r.state === "completed" || r.state === "closed";
        const href = finished ? `/student/crosswords/${r.assignmentId}/result` : `/student/crosswords/${r.assignmentId}`;
        const closing = formatClosing(r.closesAt);
        return (
          <li key={r.assignmentId}>
            <article className="flex h-full flex-col gap-2 rounded-lg border border-slate-400 bg-white p-4">
              <p className="inline-flex w-fit items-center gap-2 rounded border border-slate-500 px-2 py-1 text-sm font-semibold">
                <span aria-hidden="true">{label.icon}</span>
                {label.text}
              </p>
              <h2 className="text-lg font-semibold">{r.title}</h2>
              <p className="text-sm text-slate-800">
                {r.classroomName} · 낱말 {r.wordCount}개 · {LEVEL_LABEL[r.level]}
              </p>
              {r.state === "in_progress" || (r.state === "closed" && r.filledCount > 0) ? (
                <p className="text-sm">
                  채운 칸 {r.filledCount}/{r.totalCells}
                  <progress className="ml-2 h-2 w-24 align-middle" max={r.totalCells} value={r.filledCount} aria-label={`채운 칸 ${r.filledCount}개, 전체 ${r.totalCells}개`} />
                </p>
              ) : null}
              <p className="text-sm text-slate-800">
                {r.state === "closed" ? "수업에서 닫힌 퍼즐이에요." : r.state === "completed" ? "완성했어요." : (closing ?? "마감 시간이 없어요.")}
              </p>
              <div className="mt-auto pt-2">
                <Link
                  href={href}
                  className="inline-flex min-h-12 items-center justify-center rounded border-2 border-slate-900 bg-slate-900 px-5 py-2 text-base font-semibold text-white"
                >
                  {label.action}
                  <span className="sr-only"> {r.title}</span>
                </Link>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
