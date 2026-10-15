"use client";

import { useState } from "react";
import type { BatchSummary } from "@/features/accounts/batch/batch-schemas";

type Props = { summary: BatchSummary; credentialCsv: string };

export function BatchResultPanel({ summary, credentialCsv }: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const failedRows = summary.results.filter((r) => !r.ok);
  const notEnrolled = summary.results.filter((r) => r.ok && r.enrollmentError);

  function download() {
    const blob = new Blob([credentialCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `student-credentials-${summary.batchId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <section aria-labelledby="result-heading" className="space-y-4">
      <h2 id="result-heading" className="text-lg font-semibold">
        생성 결과
      </h2>
      <p role="status">
        전체 {summary.total}명 중 <strong>{summary.succeeded}명 성공</strong>,{" "}
        <strong>{summary.failed}명 실패</strong>
      </p>

      {summary.succeeded > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm">
            아이디와 임시 비밀번호는 <strong>지금 한 번만</strong> 내려받을 수 있습니다. 이 페이지를
            벗어나면 다시 확인할 수 없습니다.
          </p>
          <button
            type="button"
            onClick={download}
            disabled={downloaded}
            className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {downloaded ? "다운로드 완료" : "계정 정보 CSV 내려받기"}
          </button>
        </div>
      ) : null}

      {notEnrolled.length > 0 ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">계정은 만들었지만 학급에 등록하지 못한 학생 {notEnrolled.length}명</p>
          <ul className="mt-1 list-disc pl-5">
            {notEnrolled.map((r) =>
              r.ok ? (
                <li key={r.line}>
                  {r.studentName} ({r.studentNo}): {r.enrollmentError}
                </li>
              ) : null,
            )}
          </ul>
          <p className="mt-1">학생 명단 관리 화면에서 직접 추가해 주세요.</p>
        </div>
      ) : null}

      {failedRows.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left font-medium text-red-700">
            생성하지 못한 학생 ({failedRows.length})
          </caption>
          <thead>
            <tr className="bg-red-50 text-left">
              <th scope="col" className="border border-red-200 px-2 py-1">
                행
              </th>
              <th scope="col" className="border border-red-200 px-2 py-1">
                이름
              </th>
              <th scope="col" className="border border-red-200 px-2 py-1">
                학번
              </th>
              <th scope="col" className="border border-red-200 px-2 py-1">
                사유
              </th>
            </tr>
          </thead>
          <tbody>
            {failedRows.map((r) =>
              r.ok ? null : (
                <tr key={r.line}>
                  <th scope="row" className="border border-red-200 px-2 py-1 font-normal">
                    {r.line}행
                  </th>
                  <td className="border border-red-200 px-2 py-1">{r.studentName}</td>
                  <td className="border border-red-200 px-2 py-1">{r.studentNo}</td>
                  <td className="border border-red-200 px-2 py-1 text-red-800">{r.error}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
