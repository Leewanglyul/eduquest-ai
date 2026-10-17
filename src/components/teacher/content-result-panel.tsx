import Link from "next/link";
import type { ContentRunState } from "@/features/content/import/actions";

type Props = { result: NonNullable<ContentRunState["result"]> };

export function ContentResultPanel({ result }: Props) {
  return (
    <section aria-labelledby="content-result-heading" className="space-y-3">
      <h2 id="content-result-heading" className="text-lg font-semibold">
        저장 완료
      </h2>
      <p className="text-sm" role="status">
        「{result.title}」에 단어 <strong>{result.accepted}</strong>개를 저장했습니다.
        {result.skipped > 0 ? ` ${result.skipped}개는 이미 세트에 있어 건너뛰었습니다.` : ""}
        {result.archived > 0 ? ` 기존 단어 ${result.archived}개는 보관 처리되었습니다.` : ""}
      </p>
      <div className="flex gap-4 text-sm">
        <Link href={`/teacher/content/${result.setId}`} className="underline">
          세트 보기
        </Link>
        <Link href={`/teacher/content/${result.setId}/import`} className="underline">
          이 세트에 단어 더 추가하기
        </Link>
      </div>
    </section>
  );
}
