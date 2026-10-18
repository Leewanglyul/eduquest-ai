import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentAreaPage } from "@/lib/rbac/student-guard";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { CrosswordPlayList } from "@/components/student/crossword-play-list";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { PlayError } from "@/features/crossword/play/errors";
import { listPlayable } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

/** The student's puzzle list. Behind the go-live gate (lib/flags): off against a hosted project until switched on. */
export default async function CrosswordListPage() {
  if (!isCrosswordPlayEnabled()) notFound();
  const profile = await requireStudentAreaPage();

  let rows;
  try {
    rows = await listPlayable(await getStudentIdForProfile(profile.id));
  } catch (err) {
    if (err instanceof PlayError) notFound();
    throw err;
  }
  const open = rows.filter((r) => r.state === "new" || r.state === "in_progress").length;

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 lg:px-6">
      <header>
        <Link href="/student" className="inline-flex min-h-11 items-center text-sm underline">
          ← 학생 홈
        </Link>
        <h1 className="text-2xl font-semibold">풀 수 있는 퍼즐</h1>
        <p className="mt-1 text-base text-slate-800" aria-live="polite">
          {open > 0 ? `지금 풀 수 있는 퍼즐이 ${open}개 있어요.` : "지금 새로 풀 퍼즐은 없어요."}
        </p>
      </header>
      <CrosswordPlayList rows={rows} />
    </main>
  );
}
