import Link from "next/link";
import type { CrosswordListItem, CrosswordListView } from "@/features/crossword/review/service";
import { LEVEL_LABEL, STATUS_LABEL } from "@/features/crossword/review/view-model";

type Props = { items: CrosswordListItem[]; view: CrosswordListView };

const EMPTY: Record<CrosswordListView, string> = {
  draft: "작성 중인 초안이 없습니다. 단어 세트에서 새 퍼즐을 만들어 보세요.",
  published: "배포된 퍼즐이 없습니다.",
  archived: "보관된 퍼즐이 없습니다.",
};

export function CrosswordList({ items, view }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-600" role="status">
        {EMPTY[view]}
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{STATUS_LABEL[view]} 낱말 퍼즐</caption>
      <thead>
        <tr className="bg-slate-100 text-left">
          <th scope="col" className="border border-slate-200 px-2 py-1">
            퍼즐
          </th>
          <th scope="col" className="border border-slate-200 px-2 py-1">
            버전
          </th>
          <th scope="col" className="border border-slate-200 px-2 py-1">
            난이도
          </th>
          <th scope="col" className="border border-slate-200 px-2 py-1">
            단어
          </th>
          <th scope="col" className="border border-slate-200 px-2 py-1">
            배포 학급
          </th>
          <th scope="col" className="border border-slate-200 px-2 py-1">
            수정일
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <th scope="row" className="border border-slate-200 px-2 py-1 text-left font-normal">
              <Link href={`/teacher/crosswords/${item.id}`} className="underline">
                {item.title}
              </Link>
              {item.hasLiveSuccessor ? (
                <span className="ml-2 text-xs text-slate-600">(새 버전 있음)</span>
              ) : null}
            </th>
            <td className="border border-slate-200 px-2 py-1">v{item.version}</td>
            <td className="border border-slate-200 px-2 py-1">{LEVEL_LABEL[item.level]}</td>
            <td className="border border-slate-200 px-2 py-1">{item.wordCount}</td>
            <td className="border border-slate-200 px-2 py-1">{item.openAssignments}</td>
            <td className="border border-slate-200 px-2 py-1">{item.updatedAt.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
