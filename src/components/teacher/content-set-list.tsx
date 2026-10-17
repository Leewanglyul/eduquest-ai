import Link from "next/link";
import type { ContentSetListItem, ContentSetView } from "@/features/content/sets/service";

type Props = { items: ContentSetListItem[]; view: ContentSetView };

const lengthRange = (item: ContentSetListItem) =>
  item.minAnswerLength === null
    ? "-"
    : item.minAnswerLength === item.maxAnswerLength
      ? `${item.minAnswerLength}글자`
      : `${item.minAnswerLength}~${item.maxAnswerLength}글자`;

export function ContentSetList({ items, view }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-600" role="status">
        {view === "archived" ? "보관된 세트가 없습니다." : "아직 단어 세트가 없습니다. CSV 파일로 첫 세트를 만들어 보세요."}
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{view === "archived" ? "보관된 단어 세트" : "단어 세트"}</caption>
      <thead>
        <tr className="bg-slate-100 text-left">
          <th scope="col" className="border border-slate-200 px-2 py-1">세트</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">단어 수</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">정답 글자 수</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">학급</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">구분</th>
          <th scope="col" className="border border-slate-200 px-2 py-1">수정일</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <th scope="row" className="border border-slate-200 px-2 py-1 text-left font-normal">
              <Link href={`/teacher/content/${item.id}`} className="underline">
                {item.title}
              </Link>
            </th>
            <td className="border border-slate-200 px-2 py-1">{item.entryCount}</td>
            <td className="border border-slate-200 px-2 py-1">{lengthRange(item)}</td>
            <td className="border border-slate-200 px-2 py-1">
              {item.classroomName ? `${item.classroomName}${item.classroomArchived ? " (보관됨)" : ""}` : "-"}
            </td>
            <td className="border border-slate-200 px-2 py-1">{item.mine ? "내 세트" : "학급 세트"}</td>
            <td className="border border-slate-200 px-2 py-1">{item.updatedAt.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
