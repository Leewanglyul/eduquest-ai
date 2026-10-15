import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTeacherArea } from "@/lib/rbac/guards";
import {
  getClassroomForActor,
  listAddableTeachers,
  listCoTeachers,
} from "@/features/classrooms/queries";
import { canArchiveClassroom, canManageCoTeachers } from "@/features/classrooms/domain";
import { ClassroomCodeBadge } from "@/components/teacher/classroom-code-badge";
import { ClassroomForm } from "@/components/teacher/classroom-form";
import { ArchiveControls } from "@/components/teacher/archive-controls";
import { CoTeacherPanel } from "@/components/teacher/co-teacher-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ classroomId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClassroomSettingsPage({ params }: PageProps) {
  let actor;
  try {
    actor = await requireTeacherArea();
  } catch {
    redirect("/teacher/sign-in");
  }

  const { classroomId } = await params;
  if (!UUID.test(classroomId)) notFound();

  const classroom = await getClassroomForActor(actor, classroomId);
  if (!classroom) notFound();

  const archived = classroom.archivedAt !== null;
  const canManage = canManageCoTeachers(classroom.role);
  const [coTeachers, candidates] = await Promise.all([
    listCoTeachers(classroom.id),
    canManage ? listAddableTeachers(actor, classroom) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <nav aria-label="경로" className="text-sm">
        <Link href={`/teacher/classrooms/${classroom.id}`} className="underline">
          {classroom.name}
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold">학급 설정</h1>
        <ClassroomCodeBadge code={classroom.code} />
      </header>

      {archived ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          보관된 학급은 수정할 수 없습니다.
        </p>
      ) : null}

      <section aria-labelledby="info-heading" className="space-y-3">
        <h2 id="info-heading" className="text-lg font-semibold">
          기본 정보
        </h2>
        <ClassroomForm
          mode="edit"
          classroomId={classroom.id}
          defaultName={classroom.name}
          disabled={archived}
        />
      </section>

      <CoTeacherPanel
        classroomId={classroom.id}
        coTeachers={coTeachers.map((t) => ({ teacherId: t.teacherId, displayName: t.displayName }))}
        candidates={candidates}
        canManage={canManage}
        disabled={archived}
      />

      <section aria-labelledby="archive-heading" className="space-y-3">
        <h2 id="archive-heading" className="text-lg font-semibold">
          학급 보관
        </h2>
        <ArchiveControls
          classroomId={classroom.id}
          archived={archived}
          canArchive={canArchiveClassroom(classroom.role)}
        />
      </section>
    </main>
  );
}
