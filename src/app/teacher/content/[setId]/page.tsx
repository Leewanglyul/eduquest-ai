import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { ContentEntryTable } from "@/components/teacher/content-entry-table";
import { ContentSetHeader } from "@/components/teacher/content-set-header";
import { getContentSetDetail } from "@/features/content/sets/service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ setId: string }> };

export default async function ContentSetPage({ params }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { setId } = await params;

  // Not visible to this teacher is reported like "missing": existence is not leaked.
  const detail = await getContentSetDetail(profile, setId);
  if (!detail) notFound();
  const { set, entries, readOnly } = detail;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/teacher/content" className="text-sm underline">
        단어 세트 목록
      </Link>
      <h1 className="mt-4 text-xl font-semibold">
        {set.title}
        {set.archivedAt ? <span className="ml-2 text-sm font-normal text-slate-600">(보관됨)</span> : null}
      </h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        단어 {entries.length}개
        {detail.classroomName ? ` · 학급: ${detail.classroomName}${set.classroomArchived ? " (보관됨)" : ""}` : ""}
        {detail.archivedEntryCount > 0 ? ` · 바꾸기로 보관된 단어 ${detail.archivedEntryCount}개` : ""}
      </p>

      <section aria-label="세트 관리" className="mb-8">
        <ContentSetHeader setId={set.id} title={set.title} archived={set.archivedAt !== null} classroomArchived={set.classroomArchived} />
      </section>

      {!readOnly ? (
        <p className="mb-4 text-sm">
          <Link href={`/teacher/content/${set.id}/import`} className="underline">
            CSV로 단어 추가하기 / 전체 바꾸기
          </Link>
        </p>
      ) : null}

      <ContentEntryTable entries={entries} readOnly={readOnly} />
      <p className="mt-4 text-xs text-slate-600">학생 이름, 학번 등 개인정보는 넣지 마세요.</p>
    </main>
  );
}
