import { redirect } from "next/navigation";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { CreateStudentForm } from "@/components/teacher/create-student-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ classroomId: string }>;
};

export default async function NewStudentPage({ params }: PageProps) {
  try {
    await requireTeacherArea();
  } catch {
    redirect("/teacher/sign-in");
  }
  const { classroomId } = await params;

  return (
    <main className="mx-auto max-w-xl p-8" data-classroom-id={classroomId}>
      <h1 className="text-xl font-semibold">학생 계정 만들기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        학생 정보를 입력하면 아이디와 임시 비밀번호가 한 번만 표시됩니다.
      </p>
      <CreateStudentForm />
    </main>
  );
}
