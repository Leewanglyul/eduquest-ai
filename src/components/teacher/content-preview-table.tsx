import type { ContentPreviewView } from "@/features/content/import/actions";
import { rowIssueMessage } from "@/features/content/import/import-errors";

type Props = { preview: ContentPreviewView };

const MODE_SUMMARY: Record<ContentPreviewView["mode"], string> = {
  create: "새 세트로 저장합니다.",
  append: "기존 세트에 추가합니다.",
  replace: "기존 단어를 보관 처리하고 이 파일의 단어로 바꿉니다.",
};

export function ContentPreviewTable({ preview }: Props) {
  const { valid, invalid, counts, notices } = preview;

  return (
    <section aria-labelledby="content-preview-heading" className="space-y-6">
      <h2 id="content-preview-heading" className="text-lg font-semibold">
        미리보기 결과
      </h2>
      <p className="text-sm" role="status">
        정상 <strong>{counts.accepted - counts.withWarnings}</strong>개 · 경고 <strong>{counts.withWarnings}</strong>개 · 제외{" "}
        <strong>{counts.rejected}</strong>개
        {counts.rejected > 0 ? " (제외된 행은 저장되지 않습니다.)" : ""}
      </p>
      <p className="text-sm text-slate-700">
        「{preview.title}」 — {MODE_SUMMARY[preview.mode]}
        {preview.mode === "replace" ? ` 기존 단어 ${preview.willArchive}개를 보관 처리하고 ${valid.length}개로 바꿉니다.` : ""}
      </p>

      {notices.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-slate-700">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {invalid.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left font-medium text-red-700">제외된 행 ({invalid.length})</caption>
          <thead>
            <tr className="bg-red-50 text-left">
              <th scope="col" className="border border-red-200 px-2 py-1">행</th>
              <th scope="col" className="border border-red-200 px-2 py-1">용어</th>
              <th scope="col" className="border border-red-200 px-2 py-1">이유</th>
            </tr>
          </thead>
          <tbody>
            {invalid.map((issue) => (
              <tr key={issue.line}>
                <th scope="row" className="border border-red-200 px-2 py-1 font-normal">{issue.line}행</th>
                <td className="border border-red-200 px-2 py-1">{issue.term || "(비어 있음)"}</td>
                <td className="border border-red-200 px-2 py-1 text-red-800">{issue.messages.join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {valid.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left font-medium">저장될 단어 ({valid.length})</caption>
          <thead>
            <tr className="bg-slate-100 text-left">
              <th scope="col" className="border border-slate-200 px-2 py-1">행</th>
              <th scope="col" className="border border-slate-200 px-2 py-1">용어</th>
              <th scope="col" className="border border-slate-200 px-2 py-1">퍼즐 정답</th>
              <th scope="col" className="border border-slate-200 px-2 py-1">글자 수</th>
              <th scope="col" className="border border-slate-200 px-2 py-1">뜻</th>
              <th scope="col" className="border border-slate-200 px-2 py-1">참고</th>
            </tr>
          </thead>
          <tbody>
            {valid.map((row) => (
              <tr key={row.line}>
                <th scope="row" className="border border-slate-200 px-2 py-1 font-normal">{row.line}행</th>
                <td className="border border-slate-200 px-2 py-1">{row.term}</td>
                <td className="border border-slate-200 px-2 py-1 font-mono">{row.answer}</td>
                <td className="border border-slate-200 px-2 py-1">{row.answerLength}</td>
                <td className="border border-slate-200 px-2 py-1">{row.definition}</td>
                <td className="border border-slate-200 px-2 py-1 text-amber-800">
                  {row.warnings.map((w) => rowIssueMessage(w)).join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-red-700" role="alert">
          {preview.invalid.length > 0 && preview.counts.accepted === 0
            ? "저장할 수 있는 단어가 없습니다. 오류를 고친 뒤 다시 올려 주세요."
            : "추가할 새 단어가 없습니다. 모두 이미 세트에 있는 단어입니다."}
        </p>
      )}
    </section>
  );
}
