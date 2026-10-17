import Link from "next/link";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { ContentImportForm } from "@/components/teacher/content-import-form";
import { CONTENT_IMPORT_LIMITS, CONTENT_SAMPLE_HREF } from "@/features/content/import/limits";
import { listClassroomsForActor } from "@/features/classrooms/queries";

export const dynamic = "force-dynamic";

export default async function NewContentSetPage() {
  const profile = await requireTeacherAreaPage();
  const classrooms = await listClassroomsForActor(profile, { archived: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/teacher/content" className="text-sm underline">
        단어 세트 목록
      </Link>
      <h1 className="mt-4 text-xl font-semibold">단어 세트 만들기 (CSV)</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        용어와 뜻이 들어 있는 CSV 파일을 올려 미리 확인한 뒤, 낱말 퍼즐 등에 쓸 단어 세트로 저장합니다.
      </p>
      <ContentImportForm
        classrooms={classrooms.map((c) => ({ id: c.id, name: c.name }))}
        limits={CONTENT_IMPORT_LIMITS}
        sampleHref={CONTENT_SAMPLE_HREF}
      />
    </main>
  );
}
