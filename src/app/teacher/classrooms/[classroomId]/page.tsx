import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherAreaPage } from "@/lib/rbac/page-guard";
import { getClassroomForActor } from "@/features/classrooms/queries";
import { listRoster } from "@/features/enrollments/queries";
import { ClassroomCodeBadge } from "@/components/teacher/classroom-code-badge";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ classroomId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_LABEL = { owner: "담임", co_teacher: "공동 담임", admin: "관리자" } as const;

export default async function ClassroomDetailPage({ params }: PageProps) {
  const actor = await requireTeacherAreaPage();

  const { classroomId } = await params;
  if (!UUID.test(classroomId)) notFound();

  const classroom = await getClassroomForActor(actor, classroomId);
  if (!classroom) notFound();

  const roster = await listRoster(classroom.id);
  const archived = classroom.archivedAt !== null;
  const base = `/teacher/classrooms/${classroom.id}`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <nav aria-label="경로" className="text-sm">
        <Link href="/teacher/classrooms" className="underline">
          학급 목록
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{classroom.name}</h1>
        <p className="text-sm text-slate-600">내 역할: {ROLE_LABEL[classroom.role]}</p>
        <ClassroomCodeBadge code={classroom.code} />
      </header>

      {archived ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          보관된 학급입니다. 수정하려면 담임이 보관을 해제해야 합니다.
        </p>
      ) : null}

      <nav aria-label="학급 관리" className="flex flex-wrap gap-3 text-sm">
        <Link href={`${base}/students`} className="rounded-md border border-slate-300 px-3 py-1">
          학생 명단 관리
        </Link>
        <Link href={`${base}/settings`} className="rounded-md border border-slate-300 px-3 py-1">
          학급 설정
        </Link>
        {archived ? null : (
          <>
            <Link href={`${base}/students/new`} className="rounded-md border border-slate-300 px-3 py-1">
              학생 계정 만들기
            </Link>
            <Link href={`${base}/students/import`} className="rounded-md border border-slate-300 px-3 py-1">
              CSV로 일괄 만들기
            </Link>
          </>
        )}
      </nav>

      <section aria-labelledby="roster-heading" className="space-y-2">
        <h2 id="roster-heading" className="text-lg font-semibold">
          학생 명단 ({roster.length}명)
        </h2>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-600">등록된 학생이 없습니다.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{classroom.name} 학생 명단</caption>
            <thead>
              <tr className="bg-slate-100 text-left">
                <th scope="col" className="border border-slate-200 px-2 py-1">
                  이름
                </th>
                <th scope="col" className="border border-slate-200 px-2 py-1">
                  학번
                </th>
                <th scope="col" className="border border-slate-200 px-2 py-1">
                  학년
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.enrollmentId}>
                  <th scope="row" className="border border-slate-200 px-2 py-1 font-normal">
                    {s.displayName}
                  </th>
                  <td className="border border-slate-200 px-2 py-1">{s.studentNo}</td>
                  <td className="border border-slate-200 px-2 py-1">{s.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
