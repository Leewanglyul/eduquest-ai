import Link from "next/link";
import type { CrosswordDetail } from "@/features/crossword/review/service";
import { STATUS_LABEL } from "@/features/crossword/review/view-model";

type Props = { versions: CrosswordDetail["versions"]; currentId: string };

/** Every version of the puzzle, oldest first. A new version is a copy; the old one stays readable, frozen. */
export function CrosswordVersionHistory({ versions, currentId }: Props) {
  return (
    <section aria-labelledby="versions-title">
      <h2 id="versions-title" className="mb-2 text-base font-semibold">
        버전 기록
      </h2>
      <ol className="space-y-1 text-sm">
        {versions.map((v) => (
          <li key={v.id}>
            {v.id === currentId ? (
              <strong aria-current="page">v{v.version} (현재 화면)</strong>
            ) : (
              <Link href={`/teacher/crosswords/${v.id}`} className="underline">
                v{v.version}
              </Link>
            )}{" "}
            · {STATUS_LABEL[v.status]}
            {v.publishedAt ? ` · 배포 ${v.publishedAt.slice(0, 10)}` : ""}
            {v.supersedesId
              ? ` · v${versions.find((x) => x.id === v.supersedesId)?.version ?? "?"}에서 복사`
              : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
