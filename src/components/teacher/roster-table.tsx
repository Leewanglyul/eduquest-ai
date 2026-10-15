import type { RosterEntry, TransferTarget } from "@/features/enrollments/domain";
import { RemoveStudentButton } from "./remove-student-button";
import { TransferStudentDialog } from "./transfer-student-dialog";

type Props = {
  classroomId: string;
  classroomName: string;
  roster: RosterEntry[];
  targets: TransferTarget[];
  /** Archived classrooms are read-only. */
  readOnly: boolean;
};

export function RosterTable({ classroomId, classroomName, roster, targets, readOnly }: Props) {
  if (roster.length === 0) {
    return <p className="text-sm text-slate-600">등록된 학생이 없습니다.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{classroomName} 학생 명단</caption>
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
          <th scope="col" className="border border-slate-200 px-2 py-1">
            관리
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
            <td className="border border-slate-200 px-2 py-1">
              <div className="flex flex-wrap items-center gap-2">
                <TransferStudentDialog
                  sourceClassroomId={classroomId}
                  studentId={s.studentId}
                  studentName={s.displayName}
                  targets={targets}
                  disabled={readOnly}
                />
                <RemoveStudentButton
                  classroomId={classroomId}
                  studentId={s.studentId}
                  studentName={s.displayName}
                  disabled={readOnly}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
