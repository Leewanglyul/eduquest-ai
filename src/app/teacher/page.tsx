import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { teacherSignOutAction } from "@/features/auth/teacher-actions";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  let profile;
  try {
    profile = await requireTeacherArea();
  } catch {
    redirect("/teacher/sign-in");
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">교사 대시보드</h1>
      <p className="mt-2 text-sm text-slate-600">
        {profile.display_name} ({profile.role})
      </p>
      <nav aria-label="교사 메뉴" className="mt-6">
        <Link href="/teacher/classrooms" className="text-sm underline">
          내 학급
        </Link>
      </nav>
      <form action={teacherSignOutAction} className="mt-6">
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  );
}
