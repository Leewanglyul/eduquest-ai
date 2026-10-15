import { TeacherSignInForm } from "@/components/auth/teacher-sign-in-form";

export const dynamic = "force-dynamic";

export default function TeacherSignInPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-xl font-semibold">교사 로그인</h1>
      <TeacherSignInForm />
    </main>
  );
}
