import type { BatchPreview } from "@/features/accounts/batch/preview";

type Props = { preview: BatchPreview };

export function BatchPreviewTable({ preview }: Props) {
  const { valid, invalid } = preview;

  return (
    <section aria-labelledby="preview-heading" className="space-y-6">
      <h2 id="preview-heading" className="text-lg font-semibold">
        미리보기 결과
      </h2>
      <p className="text-sm" role="status">
        생성 가능 <strong>{valid.length}</strong>명 · 오류 <strong>{invalid.length}</strong>건
        {invalid.length > 0 ? " (오류가 있는 행은 생성되지 않습니다.)" : ""}
      </p>

      {invalid.length > 0 ? (
        <div>
          <table className="w-full border-collapse text-sm">
            <caption className="mb-2 text-left font-medium text-red-700">
              오류가 있는 행 ({invalid.length})
            </caption>
            <thead>
              <tr className="bg-red-50 text-left">
                <th scope="col" className="border border-red-200 px-2 py-1">
                  행
                </th>
                <th scope="col" className="border border-red-200 px-2 py-1">
                  학번
                </th>
                <th scope="col" className="border border-red-200 px-2 py-1">
                  오류 내용
                </th>
              </tr>
            </thead>
            <tbody>
              {invalid.map((issue) => (
                <tr key={issue.line}>
                  <th scope="row" className="border border-red-200 px-2 py-1 font-normal">
                    {issue.line}행
                  </th>
                  <td className="border border-red-200 px-2 py-1">{issue.studentNo || "(비어 있음)"}</td>
                  <td className="border border-red-200 px-2 py-1 text-red-800">
                    {issue.errors.join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {valid.length > 0 ? (
        <div>
          <table className="w-full border-collapse text-sm">
            <caption className="mb-2 text-left font-medium">생성될 학생 ({valid.length})</caption>
            <thead>
              <tr className="bg-slate-100 text-left">
                <th scope="col" className="border border-slate-200 px-2 py-1">
                  행
                </th>
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
              {valid.map(({ line, row }) => (
                <tr key={line}>
                  <th scope="row" className="border border-slate-200 px-2 py-1 font-normal">
                    {line}행
                  </th>
                  <td className="border border-slate-200 px-2 py-1">{row.studentName}</td>
                  <td className="border border-slate-200 px-2 py-1">{row.studentNo}</td>
                  <td className="border border-slate-200 px-2 py-1">{row.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
