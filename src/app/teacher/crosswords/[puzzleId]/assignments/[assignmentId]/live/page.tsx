import Link from "next/link";
import { notFound } from "next/navigation";
import { CrosswordLiveView } from "@/components/teacher/crossword-live-view";
import { CrosswordError } from "@/features/crossword/messages";
import { getLiveView } from "@/features/crossword/results/team-service";
import { LIVE_TEXT } from "@/features/crossword/teams/live";
import { isCollabPlayEnabled } from "@/lib/flags";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ puzzleId: string; assignmentId: string }> };

/**
 * The in-class view of one assignment (M2-3.4 TP-0). Behind the team-play switch. Open to the classroom's owner and
 * co-teachers, and to the school admin read-only; anyone else gets "not found" (the assignment-scoped team list is
 * checked first). Closing reuses the existing assignment close unchanged (Gate 3 compatibility decision, OD-TP17).
 */
export default async function CrosswordLivePage({ params }: PageProps) {
  if (!isCollabPlayEnabled()) notFound();
  const profile = await requireTeacherAreaPage();
  const { puzzleId, assignmentId } = await params;

  let view;
  try {
    view = await getLiveView(profile, puzzleId, assignmentId);
  } catch (err) {
    if (err instanceof CrosswordError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-3 sm:p-6">
      <Link href={`/teacher/crosswords/${puzzleId}/assignments/${assignmentId}`} className="inline-flex min-h-11 items-center text-sm underline">
        진행 상황으로 돌아가기
      </Link>
      <h1 className="text-xl font-semibold">{LIVE_TEXT.title}</h1>
      <CrosswordLiveView puzzleId={puzzleId} assignmentId={assignmentId} initial={view} canWrite={profile.role !== "admin"} />
    </main>
  );
}
