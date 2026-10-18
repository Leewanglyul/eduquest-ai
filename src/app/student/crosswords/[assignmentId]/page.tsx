import type { Viewport } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStudentAreaPage } from "@/lib/rbac/student-guard";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { CrosswordPlayBoard } from "@/components/student/crossword-play-board";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { PlayError } from "@/features/crossword/play/errors";
import { PLAY_TEXT, playMessage } from "@/features/crossword/play/messages";
import { startOrResume } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

/**
 * The soft keyboard shrinks the page instead of covering it, so the pinned tools bar stays above the keyboard and the
 * selected cell stays visible (Chrome and Samsung Internet honour interactive-widget).
 */
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

type PageProps = { params: Promise<{ assignmentId: string }> };

/**
 * Assignment entry. Opening creates the attempt on the first visit and resumes it afterwards. A finished or closed
 * attempt goes to its result page; a puzzle that is not visible to this student looks like one that does not exist.
 */
export default async function CrosswordPlayPage({ params }: PageProps) {
  if (!isCrosswordPlayEnabled()) notFound();
  const profile = await requireStudentAreaPage();
  const { assignmentId } = await params;

  let payload;
  try {
    const studentId = await getStudentIdForProfile(profile.id);
    payload = await startOrResume(studentId, assignmentId);
  } catch (err) {
    if (err instanceof PlayError) {
      if (err.code === "CLOSED" || err.code === "NOT_OPEN_YET") {
        return (
          <main className="mx-auto max-w-2xl space-y-4 p-4">
            <h1 className="text-xl font-semibold">{err.code === "CLOSED" ? "닫힌 퍼즐이에요" : "아직 열리지 않았어요"}</h1>
            <p role="status">{err.code === "CLOSED" ? PLAY_TEXT.closedBanner : playMessage("NOT_OPEN_YET")}</p>
            <Link href="/student/crosswords" className="inline-flex min-h-12 items-center rounded border-2 border-slate-900 px-5 font-semibold">
              퍼즐 목록으로
            </Link>
          </main>
        );
      }
      notFound();
    }
    throw err;
  }

  if (payload.attempt.status === "completed" || payload.readonly) redirect(`/student/crosswords/${assignmentId}/result`);
  return <CrosswordPlayBoard payload={payload} />;
}
