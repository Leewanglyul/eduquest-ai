import Link from "next/link";
import { notFound } from "next/navigation";
import { CrosswordTeamSetup } from "@/components/teacher/crossword-team-setup";
import { CrosswordError } from "@/features/crossword/messages";
import { getTeamSetup } from "@/features/crossword/results/team-service";
import { getPuzzleDetail } from "@/features/crossword/review/service";
import { LIVE_TEXT } from "@/features/crossword/teams/live";
import { isCollabPlayEnabled } from "@/lib/flags";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ puzzleId: string; assignmentId: string }> };

/**
 * Team setup of one assignment (M2-3.4 TP-0). Behind the team-play switch. The assignment-scoped team list is the
 * access gate: the classroom's owner and co-teachers manage teams, the school admin reads only, anyone else gets
 * "not found" (P2 D-1).
 */
export default async function CrosswordTeamsPage({ params }: PageProps) {
  if (!isCollabPlayEnabled()) notFound();
  const profile = await requireTeacherAreaPage();
  const { puzzleId, assignmentId } = await params;

  let setup;
  try {
    setup = await getTeamSetup(profile, assignmentId);
  } catch (err) {
    if (err instanceof CrosswordError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  const found = await getPuzzleDetail(profile, puzzleId);
  const assignment = found?.assignments.find((a) => a.id === assignmentId);
  if (!found || !assignment) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
      <Link href={`/teacher/crosswords/${puzzleId}/assignments/${assignmentId}`} className="inline-flex min-h-11 items-center text-sm underline">
        진행 상황으로 돌아가기
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{LIVE_TEXT.teamsTitle}</h1>
        <p className="mt-1 text-sm text-slate-700">
          {found.puzzle.title} · {assignment.classroomName ?? "(학급)"} · {assignment.status === "open" ? "열림" : "닫힘"}
        </p>
      </div>
      <CrosswordTeamSetup assignmentId={assignmentId} playMode={assignment.playMode} setup={setup} canWrite={profile.role !== "admin"} />
      <Link href={`/teacher/crosswords/${puzzleId}/assignments/${assignmentId}/live`} className="inline-flex min-h-11 items-center text-sm underline">
        {LIVE_TEXT.title}
      </Link>
    </main>
  );
}
