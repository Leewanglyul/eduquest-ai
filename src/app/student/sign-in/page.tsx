import { StudentSignInForm } from "@/components/auth/student-sign-in-form";

export const dynamic = "force-dynamic";

export default function StudentSignInPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-xl font-semibold">학생 로그인</h1>
      <StudentSignInForm />
    </main>
  );
}
