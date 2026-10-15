import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { getClassroomForActor } from "@/features/classrooms/queries";
import {
  listAddableStudents,
  listRoster,
  listTransferTargets,
} from "@/features/enrollments/queries";
import { RosterTable } from "@/components/teacher/roster-table";
import { AddStudentPanel } from "@/components/teacher/add-student-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ classroomId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClassroomStudentsPage({ params }: PageProps) {
  const actor = await requireTeacherAreaPage();

  const { classroomId } = await params;
  if (!UUID.test(classroomId)) notFound();

  const classroom = await getClassroomForActor(actor, classroomId);
  if (!classroom) notFound();

  const archived = classroom.archivedAt !== null;
  const base = `/teacher/classrooms/${classroom.id}`;
  const [roster, candidates, targets] = await Promise.all([
    listRoster(classroom.id),
    archived ? Promise.resolve([]) : listAddableStudents(classroom),
    archived ? Promise.resolve([]) : listTransferTargets(actor, classroom.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <nav aria-label="경로" className="text-sm">
        <Link href={base} className="underline">
          {classroom.name}
        </Link>
      </nav>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">학생 명단 관리</h1>
        <p className="text-sm text-slate-600">
          {classroom.name} · 현재 {roster.length}명
        </p>
      </header>

      {archived ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          보관된 학급의 명단은 볼 수만 있습니다. 수정하려면 담임이 보관을 해제해야 합니다.
        </p>
      ) : null}

      <section aria-labelledby="roster-heading" className="space-y-2">
        <h2 id="roster-heading" className="text-lg font-semibold">
          학생 명단
        </h2>
        <RosterTable
          classroomId={classroom.id}
          classroomName={classroom.name}
          roster={roster}
          targets={targets}
          readOnly={archived}
        />
      </section>

      <AddStudentPanel classroomId={classroom.id} candidates={candidates} disabled={archived} />

      {archived ? null : (
        <nav aria-label="학생 계정 만들기" className="flex flex-wrap gap-3 text-sm">
          <Link href={`${base}/students/new`} className="rounded-md border border-slate-300 px-3 py-1">
            학생 계정 만들기
          </Link>
          <Link href={`${base}/students/import`} className="rounded-md border border-slate-300 px-3 py-1">
            CSV로 일괄 만들기
          </Link>
        </nav>
      )}
    </main>
  );
}
