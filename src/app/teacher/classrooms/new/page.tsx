import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { ClassroomForm } from "@/components/teacher/classroom-form";

export const dynamic = "force-dynamic";

export default async function NewClassroomPage() {
  try {
    await requireTeacherArea();
  } catch {
    redirect("/teacher/sign-in");
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">새 학급 만들기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">만든 사람이 담임(소유자)이 됩니다.</p>
      <ClassroomForm mode="create" />
      <p className="mt-6">
        <Link href="/teacher/classrooms" className="text-sm underline">
          학급 목록으로
        </Link>
      </p>
    </main>
  );
}
