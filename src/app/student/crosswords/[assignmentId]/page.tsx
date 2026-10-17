import { notFound } from "next/navigation";
import { requireStudentAreaPage } from "@/lib/rbac/student-guard";
import { CrosswordPlayBoard } from "@/components/student/crossword-play-board";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { PlayError } from "@/features/crossword/play/errors";
import { PLAY_TEXT, playMessage } from "@/features/crossword/play/messages";
import { startOrResume } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ assignmentId: string }> };

/** F3: the bare board. The list, the result page and the final layout are M2-2.4b. */
export default async function CrosswordPlayPage({ params }: PageProps) {
  const profile = await requireStudentAreaPage();
  const { assignmentId } = await params;

  try {
    const studentId = await getStudentIdForProfile(profile.id);
    const payload = await startOrResume(studentId, assignmentId);
    return <CrosswordPlayBoard payload={payload} />;
  } catch (err) {
    if (err instanceof PlayError) {
      // Not visible to this student looks like "missing" (no enumeration); closed and not-yet-open say so.
      if (err.code === "CLOSED" || err.code === "NOT_OPEN_YET") {
        return (
          <main className="mx-auto max-w-2xl p-6">
            <p role="status">{err.code === "CLOSED" ? PLAY_TEXT.closedBanner : playMessage("NOT_OPEN_YET")}</p>
          </main>
        );
      }
      notFound();
    }
    throw err;
  }
}
