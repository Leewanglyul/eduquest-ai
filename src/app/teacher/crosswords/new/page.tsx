import Link from "next/link";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { CrosswordGenerateForm } from "@/components/teacher/crossword-generate-form";
import { CrosswordReadinessPanel } from "@/components/teacher/crossword-readiness-panel";
import { getContentSetDetail } from "@/features/content/sets/service";
import { getSetReadiness, listGeneratableSets } from "@/features/crossword/review/service";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ setId?: string }> };

export default async function NewCrosswordPage({ searchParams }: PageProps) {
  const profile = await requireTeacherAreaPage();
  const { setId } = await searchParams;
  const sets = await listGeneratableSets(profile);

  const chosen = setId ? await getSetReadiness(profile, setId) : null;
  const detail = chosen && setId ? await getContentSetDetail(profile, setId) : null;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/teacher/crosswords" className="text-sm underline">
        낱말 퍼즐 목록
      </Link>
      <h1 className="mt-4 mb-6 text-xl font-semibold">새 낱말 퍼즐</h1>

      {/* A plain GET form: choosing a set reloads the page with its readiness, no JavaScript needed. */}
      <form
        method="get"
        className="mb-8 flex flex-wrap items-end gap-3"
        aria-label="단어 세트 선택"
      >
        <div>
          <label htmlFor="setId" className="block text-sm font-medium">
            단어 세트
          </label>
          <select
            id="setId"
            name="setId"
            defaultValue={setId ?? ""}
            required
            className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="" disabled>
              세트를 선택하세요
            </option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.entryCount}개{s.classroomName ? ` · ${s.classroomName}` : ""})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md border border-slate-900 px-3 py-1 text-sm">
          세트 선택
        </button>
      </form>

      {sets.length === 0 ? (
        <p className="text-sm text-slate-600" role="status">
          사용할 수 있는 단어 세트가 없습니다. 먼저{" "}
          <Link href="/teacher/content/import" className="underline">
            CSV로 세트를 만들어
          </Link>{" "}
          주세요.
        </p>
      ) : null}

      {setId && !chosen ? (
        <p role="alert" className="text-sm text-red-600">
          단어 세트를 찾을 수 없거나 퍼즐을 만들 수 없는 세트입니다.
        </p>
      ) : null}

      {chosen && detail ? (
        <div className="space-y-8">
          <CrosswordReadinessPanel readiness={chosen.readiness} />
          <CrosswordGenerateForm
            key={detail.set.id}
            setId={detail.set.id}
            setName={chosen.title}
            entries={detail.entries.map((e) => ({
              id: e.id,
              answer: e.answer,
              definition: e.definition,
            }))}
          />
        </div>
      ) : null}
    </main>
  );
}
