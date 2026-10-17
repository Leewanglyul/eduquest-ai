import Link from "next/link";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { CrosswordList } from "@/components/teacher/crossword-list";
import { listPuzzles, type CrosswordListView } from "@/features/crossword/review/service";
import { STATUS_LABEL } from "@/features/crossword/review/view-model";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ view?: string }> };

const VIEWS: CrosswordListView[] = ["draft", "published", "archived"];

export default async function CrosswordsPage({ searchParams }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { view: rawView } = await searchParams;
  const view: CrosswordListView = VIEWS.find((v) => v === rawView) ?? "draft";
  const items = await listPuzzles(profile, view);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Link href="/teacher" className="inline-flex min-h-11 items-center text-sm underline">
        교사 대시보드
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">낱말 퍼즐</h1>
        <Link
          href="/teacher/crosswords/new"
          className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-4 text-sm text-white"
        >
          새 퍼즐
        </Link>
      </div>
      <nav aria-label="퍼즐 보기" className="mt-4 mb-4 flex gap-4 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "draft" ? "/teacher/crosswords" : `/teacher/crosswords?view=${v}`}
            className={`inline-flex min-h-11 items-center ${view === v ? "font-semibold underline" : "underline"}`}
            aria-current={view === v ? "page" : undefined}
          >
            {STATUS_LABEL[v]}
          </Link>
        ))}
      </nav>
      <CrosswordList items={items} view={view} />
    </main>
  );
}
