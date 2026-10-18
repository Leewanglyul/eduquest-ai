import { notFound, redirect } from "next/navigation";
import { requireStudentAreaPage } from "@/lib/rbac/student-guard";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { CrosswordResult } from "@/components/student/crossword-result";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { PlayError } from "@/features/crossword/play/errors";
import { loadResult } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ assignmentId: string }> };

/** The result of a finished (or closed) attempt. An attempt still being solved goes back to the board. */
export default async function CrosswordResultPage({ params }: PageProps) {
  if (!isCrosswordPlayEnabled()) notFound();
  const profile = await requireStudentAreaPage();
  const { assignmentId } = await params;

  let view;
  try {
    view = await loadResult(await getStudentIdForProfile(profile.id), assignmentId);
  } catch (err) {
    if (err instanceof PlayError) notFound();
    throw err;
  }
  if (view.status === "playing") redirect(`/student/crosswords/${assignmentId}`);
  return <CrosswordResult view={view} />;
}
