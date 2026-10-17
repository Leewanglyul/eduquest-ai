import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { ContentImportForm } from "@/components/teacher/content-import-form";
import { CONTENT_IMPORT_LIMITS, CONTENT_SAMPLE_HREF } from "@/features/content/import/limits";
import { getContentSetForActor } from "@/features/content/sets/access";
import { countLiveEntries } from "@/features/content/sets/queries";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ setId: string }> };

export default async function ImportIntoContentSetPage({ params }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { setId } = await params;

  // Not visible to this teacher is reported like "missing": existence is not leaked.
  const set = await getContentSetForActor(profile, setId);
  if (!set) notFound();

  const readOnly = set.archivedAt !== null || set.classroomArchived;
  const liveCount = await countLiveEntries(set.id);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/teacher" className="text-sm underline">
        교사 대시보드
      </Link>
      <h1 className="mt-4 text-xl font-semibold">단어 세트에 CSV 올리기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        「{set.title}」에 단어를 추가하거나 파일의 단어로 전체를 바꿉니다. 바꾸면 기존 단어는 삭제되지 않고 보관 처리됩니다.
      </p>
      {readOnly ? (
        <p role="alert" className="text-sm text-red-700">
          {set.archivedAt !== null ? "보관된 세트는 수정할 수 없습니다." : "보관된 학급의 세트는 수정할 수 없습니다."}
        </p>
      ) : (
        <ContentImportForm
          existingSet={{ id: set.id, title: set.title, liveCount }}
          limits={CONTENT_IMPORT_LIMITS}
          sampleHref={CONTENT_SAMPLE_HREF}
        />
      )}
    </main>
  );
}
