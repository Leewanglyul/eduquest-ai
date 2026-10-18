import Link from "next/link";
import { requireStudentAreaPage } from "@/lib/rbac/student-guard";
import { studentSignOutAction } from "@/features/auth/student-actions";
import { getStudentHome } from "@/features/enrollments/queries";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { listPlayable } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

/** How many puzzles the student can work on now; 0 when the feature is off or anything goes wrong (the home must load). */
async function countPlayable(profileId: string): Promise<number | null> {
  if (!isCrosswordPlayEnabled()) return null;
  try {
    const rows = await listPlayable(await getStudentIdForProfile(profileId));
    return rows.filter((r) => r.state === "new" || r.state === "in_progress").length;
  } catch {
    return 0;
  }
}

export default async function StudentHomePage() {
  const profile = await requireStudentAreaPage();

  const { grade, classrooms } = await getStudentHome();
  const playable = await countPlayable(profile.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">학생 홈</h1>
        <p className="mt-2 text-sm text-slate-600">
          {profile.display_name} 님, 환영합니다.
          {grade ? ` (${grade}학년)` : ""}
        </p>
      </header>

      <section aria-labelledby="classrooms-heading" className="space-y-2">
        <h2 id="classrooms-heading" className="text-lg font-semibold">
          내 학급
        </h2>
        {classrooms.length === 0 ? (
          <p className="text-sm text-slate-600">아직 등록된 학급이 없습니다. 선생님께 문의해 주세요.</p>
        ) : (
          <ul aria-label="내 학급 목록" className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {classrooms.map((c) => (
              <li key={c.classroomId} className="flex items-center justify-between gap-2 p-3">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-slate-600">
                  코드 <code className="font-mono tracking-widest">{c.code}</code>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {playable !== null ? (
        <section aria-labelledby="puzzles-heading" className="space-y-2">
          <h2 id="puzzles-heading" className="text-lg font-semibold">
            낱말 퍼즐
          </h2>
          <Link
            href="/student/crosswords"
            className="flex min-h-14 items-center justify-between gap-2 rounded-md border-2 border-slate-900 px-4 py-3 text-base font-semibold"
          >
            <span>{playable > 0 ? `풀 수 있는 퍼즐 ${playable}개` : "퍼즐 보기"}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      ) : null}

      <form action={studentSignOutAction}>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  );
}
