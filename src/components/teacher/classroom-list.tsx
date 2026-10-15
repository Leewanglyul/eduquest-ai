import Link from "next/link";
import type { ClassroomRole, ClassroomWithRole } from "@/features/classrooms/domain";

const ROLE_LABEL: Record<ClassroomRole, string> = {
  owner: "담임",
  co_teacher: "공동 담임",
  admin: "관리자",
};

type Props = { classrooms: ClassroomWithRole[]; emptyMessage: string; label: string };

export function ClassroomList({ classrooms, emptyMessage, label }: Props) {
  if (classrooms.length === 0) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <ul aria-label={label} className="divide-y divide-slate-200 rounded-md border border-slate-200">
      {classrooms.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div>
            <Link
              href={`/teacher/classrooms/${c.id}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {c.name}
            </Link>
            <p className="text-xs text-slate-600">
              코드 <code className="font-mono tracking-widest">{c.code}</code>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{ROLE_LABEL[c.role]}</span>
            {c.archivedAt ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5">보관됨</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
