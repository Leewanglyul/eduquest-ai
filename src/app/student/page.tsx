import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac/guards";
import { studentSignOutAction } from "@/features/auth/student-actions";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  let profile;
  try {
    profile = await requireRole("student");
  } catch {
    redirect("/student/sign-in");
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">학생 홈</h1>
      <p className="mt-2 text-sm text-slate-600">{profile.display_name} 님, 환영합니다.</p>
      <form action={studentSignOutAction} className="mt-6">
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  );
}
