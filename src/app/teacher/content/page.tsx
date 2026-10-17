import Link from "next/link";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { ContentSetList } from "@/components/teacher/content-set-list";
import { listContentSets, type ContentSetView } from "@/features/content/sets/service";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ view?: string }> };

export default async function ContentSetsPage({ searchParams }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { view: rawView } = await searchParams;
  const view: ContentSetView = rawView === "archived" ? "archived" : "active";
  const items = await listContentSets(profile, view);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/teacher" className="text-sm underline">
        교사 대시보드
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">단어 세트</h1>
        <Link href="/teacher/content/import" className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white">
          새 세트 (CSV)
        </Link>
      </div>
      <nav aria-label="세트 보기" className="mt-4 mb-4 flex gap-4 text-sm">
        <Link href="/teacher/content" className={view === "active" ? "font-semibold underline" : "underline"} aria-current={view === "active" ? "page" : undefined}>
          사용 중
        </Link>
        <Link href="/teacher/content?view=archived" className={view === "archived" ? "font-semibold underline" : "underline"} aria-current={view === "archived" ? "page" : undefined}>
          보관됨
        </Link>
      </nav>
      <ContentSetList items={items} view={view} />
    </main>
  );
}
