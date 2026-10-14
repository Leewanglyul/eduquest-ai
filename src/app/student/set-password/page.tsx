import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const dynamic = "force-dynamic";

export default async function StudentSetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/student/sign-in");
  }

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
