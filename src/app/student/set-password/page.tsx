import { requireStudentSessionPage } from "@/lib/rbac/student-guard";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const dynamic = "force-dynamic";

export default async function StudentSetPasswordPage() {
  await requireStudentSessionPage();

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-2 text-xl font-semibold">비밀번호 설정</h1>
      <p className="mb-6 text-sm text-slate-600">
        처음 로그인했습니다. 사용할 새 비밀번호를 설정해 주세요.
      </p>
      <SetPasswordForm />
    </main>
  );
}
