import Link from "next/link";
import { notFound } from "next/navigation";
import { CrosswordProgressTable } from "@/components/teacher/crossword-progress-table";
import { CrosswordError } from "@/features/crossword/messages";
import { getAssignmentProgress } from "@/features/crossword/results/service";
import { PROGRESS_TEXT, whenText } from "@/features/crossword/results/view-model";
import { getPuzzleDetail } from "@/features/crossword/review/service";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ puzzleId: string; assignmentId: string }> };

/**
 * Progress of one assignment (TV-1): who has started, how far, when they last worked, which tools they used. Read-only;
 * owner, co-teachers and the school admin only (the database function decides). Hidden, like the student screens, while
 * Student Play is switched off, so nobody reads "not started" for a feature that is not running.
 */
export default async function CrosswordProgressPage({ params }: PageProps) {
  if (!isCrosswordPlayEnabled()) notFound();
  const profile = await requireTeacherAreaPage();
  const { puzzleId, assignmentId } = await params;

  // A puzzle or an assignment that is not visible to this teacher is reported like a missing one.
  const found = await getPuzzleDetail(profile, puzzleId);
  const assignment = found?.assignments.find((a) => a.id === assignmentId);
  if (!found || !assignment) notFound();

  let rows;
  try {
    rows = await getAssignmentProgress(profile, assignmentId);
  } catch (err) {
    if (err instanceof CrosswordError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const roomName = assignment.classroomName ?? "(학급)";
  const caption = `${found.puzzle.title} · ${roomName} ${PROGRESS_TEXT.title}`;
  const asOf = new Date().toISOString();

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
      <Link href={`/teacher/crosswords/${puzzleId}`} className="inline-flex min-h-11 items-center text-sm underline">
        퍼즐로 돌아가기
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{PROGRESS_TEXT.title}</h1>
        <p className="mt-1 text-sm text-slate-700">
          {found.puzzle.title} · {roomName} · {assignment.status === "open" ? "열림" : "닫힘"}
          {assignment.closesAt ? ` · 마감 ${whenText(assignment.closesAt)}` : ""}
        </p>
      </div>

      <p className="text-sm text-slate-700">{PROGRESS_TEXT.note}</p>
      <p className="flex flex-wrap items-center gap-3 text-sm" role="status">
        <span>
          {PROGRESS_TEXT.asOf}: {whenText(asOf)}
        </span>
        <Link
          href={`/teacher/crosswords/${puzzleId}/assignments/${assignmentId}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded border border-slate-500 px-3"
        >
          {PROGRESS_TEXT.reload}
        </Link>
      </p>

      <CrosswordProgressTable rows={rows} caption={caption} />
    </main>
  );
}
