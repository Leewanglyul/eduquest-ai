import Link from "next/link";
import { notFound } from "next/navigation";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { CrosswordAssignmentList } from "@/components/teacher/crossword-assignment-list";
import { CrosswordClueLists } from "@/components/teacher/crossword-clue-lists";
import { CrosswordDraftEditor } from "@/components/teacher/crossword-draft-editor";
import { CrosswordGridPanel } from "@/components/teacher/crossword-grid-panel";
import { CrosswordPublishPanel } from "@/components/teacher/crossword-publish-panel";
import { CrosswordStatusControls } from "@/components/teacher/crossword-status-controls";
import { CrosswordVersionHistory } from "@/components/teacher/crossword-version-history";
import { CrosswordWarningPanel } from "@/components/teacher/crossword-warning-panel";
import { CROSSWORD_MIN_WORDS } from "@/features/crossword/generator/constants";
import { getPuzzleDetail, listAssignableClassrooms } from "@/features/crossword/review/service";
import {
  computeReviewWarnings,
  LEVEL_LABEL,
  STATUS_LABEL,
} from "@/features/crossword/review/view-model";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ puzzleId: string }> };

export default async function CrosswordReviewPage({ params }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { puzzleId } = await params;

  // Not visible to this teacher is reported like "missing": existence is not leaked.
  const detail = await getPuzzleDetail(profile, puzzleId);
  if (!detail) notFound();
  const { puzzle, words, assignments, versions } = detail;

  const warnings = computeReviewWarnings(words);
  const classrooms = puzzle.status === "archived" ? [] : await listAssignableClassrooms(profile);
  const multiWords = words.filter((w) => Array.from(w.answer).length >= 2).length;
  const newerVersion = versions.some((v) => v.version > puzzle.version && v.status !== "archived");
  const wasPublished = puzzle.publishedAt !== null;
  const isDraft = puzzle.status === "draft";

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
      <div>
        <Link
          href="/teacher/crosswords"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          낱말 퍼즐 목록
        </Link>
        <h1 className="mt-4 text-xl font-semibold">
          {puzzle.title}{" "}
          <span className="text-sm font-normal text-slate-600">v{puzzle.version}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          <span className="mr-2 rounded border border-slate-400 px-1 text-xs">
            {STATUS_LABEL[puzzle.status]}
          </span>
          {LEVEL_LABEL[puzzle.level]} · {puzzle.rows}×{puzzle.cols} · 단어 {words.length}개 · 시드{" "}
          {detail.seed}
        </p>
        {!isDraft ? (
          <p
            role="status"
            className="mt-3 rounded-md border border-slate-400 bg-slate-50 p-3 text-sm"
          >
            {puzzle.status === "published"
              ? "배포됨 - 수정할 수 없습니다."
              : "보관됨 - 수정할 수 없습니다."}{" "}
            바꾸려면 새 버전을 만들어야 합니다.
          </p>
        ) : null}
      </div>

      <section aria-labelledby="grid-title" className="space-y-4">
        <h2 id="grid-title" className="text-base font-semibold">
          퍼즐
        </h2>
        <CrosswordGridPanel rows={puzzle.rows} cols={puzzle.cols} words={words} />
        <CrosswordClueLists words={words} />
      </section>

      <CrosswordWarningPanel warnings={warnings} />

      {isDraft ? (
        <>
          <section aria-labelledby="edit-title">
            <h2 id="edit-title" className="mb-2 text-base font-semibold">
              초안 수정
            </h2>
            <CrosswordDraftEditor puzzleId={puzzle.id} title={puzzle.title} words={words} />
          </section>
          {multiWords < CROSSWORD_MIN_WORDS ? (
            <p role="alert" className="text-sm text-red-700">
              서로 겹치는 단어가 {CROSSWORD_MIN_WORDS}개 이상이어야 배포할 수 있습니다 (현재{" "}
              {multiWords}개).
            </p>
          ) : (
            <CrosswordPublishPanel
              puzzleId={puzzle.id}
              mode="publish"
              classrooms={classrooms}
              preselectIds={detail.previousClassroomIds}
              version={puzzle.version}
            />
          )}
        </>
      ) : null}

      {!isDraft ? (
        <CrosswordAssignmentList
          assignments={assignments}
          puzzleStatus={puzzle.status}
          progressBase={isCrosswordPlayEnabled() ? `/teacher/crosswords/${puzzleId}/assignments` : undefined}
        />
      ) : null}

      {puzzle.status === "published" ? (
        <CrosswordPublishPanel
          puzzleId={puzzle.id}
          mode="add"
          classrooms={classrooms}
          assignedIds={assignments.map((a) => a.classroomId)}
          version={puzzle.version}
        />
      ) : null}

      <CrosswordStatusControls
        puzzleId={puzzle.id}
        status={puzzle.status}
        wasPublished={wasPublished}
        hasNewerVersion={newerVersion}
      />

      <CrosswordVersionHistory versions={versions} currentId={puzzle.id} />
    </main>
  );
}
