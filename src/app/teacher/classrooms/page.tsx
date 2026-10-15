import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { listClassroomsForActor } from "@/features/classrooms/queries";
import { ClassroomList } from "@/components/teacher/classroom-list";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ archived?: string }>;
};

export default async function ClassroomsPage({ searchParams }: PageProps) {
  let actor;
  try {
    actor = await requireTeacherArea();
  } catch {
    redirect("/teacher/sign-in");
  }

  const showArchived = (await searchParams).archived === "1";
  const classrooms = await listClassroomsForActor(actor, { archived: showArchived });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{showArchived ? "보관된 학급" : "내 학급"}</h1>
        <Link href="/teacher/classrooms/new" className="rounded-md bg-slate-900 px-4 py-2 text-white">
          새 학급 만들기
        </Link>
      </header>

      <nav aria-label="학급 보기 전환" className="flex gap-4 text-sm">
        <Link
          href="/teacher/classrooms"
          aria-current={showArchived ? undefined : "page"}
          className={showArchived ? "underline" : "font-semibold"}
        >
          진행 중
        </Link>
        <Link
          href="/teacher/classrooms?archived=1"
          aria-current={showArchived ? "page" : undefined}
          className={showArchived ? "font-semibold" : "underline"}
        >
          보관됨
        </Link>
      </nav>

      <ClassroomList
        classrooms={classrooms}
        label={showArchived ? "보관된 학급 목록" : "학급 목록"}
        emptyMessage={showArchived ? "보관된 학급이 없습니다." : "아직 학급이 없습니다. 새 학급을 만들어 보세요."}
      />

      <p>
        <Link href="/teacher" className="text-sm underline">
          대시보드로 돌아가기
        </Link>
      </p>
    </main>
  );
}
