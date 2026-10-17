import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { BatchUploadForm } from "@/components/teacher/batch-upload-form";
import { MAX_BATCH_ROWS, MAX_CSV_BYTES } from "@/features/accounts/batch/batch-schemas";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ classroomId: string }>;
};

export default async function ImportStudentsPage({ params }: PageProps) {
  await requireTeacherAreaPage();
  const { classroomId } = await params;

  return (
    <main className="mx-auto max-w-3xl p-8" data-classroom-id={classroomId}>
      <h1 className="text-xl font-semibold">학생 계정 일괄 만들기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        CSV 파일을 올려 미리 확인한 뒤, 학생 계정을 한 번에 만듭니다.
      </p>
      <BatchUploadForm
        classroomId={classroomId}
        maxRows={MAX_BATCH_ROWS}
        maxCsvBytes={MAX_CSV_BYTES}
      />
    </main>
  );
}
