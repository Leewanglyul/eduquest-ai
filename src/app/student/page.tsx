import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac/guards";
import { studentSignOutAction } from "@/features/auth/student-actions";
import { getStudentHome } from "@/features/enrollments/queries";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  let profile;
  try {
    profile = await requireRole("student");
  } catch {
    redirect("/student/sign-in");
  }

  const { grade, classrooms } = await getStudentHome();

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

      <form action={studentSignOutAction}>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  );
}
