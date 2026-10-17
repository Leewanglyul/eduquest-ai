"use client";

import { useActionState, useState } from "react";
import {
  commitBatchAction,
  previewBatchAction,
  type BatchPreviewState,
  type BatchRunState,
} from "@/features/accounts/batch/actions";
import { BatchPreviewTable } from "./batch-preview-table";
import { BatchResultPanel } from "./batch-result-panel";

const previewInitial: BatchPreviewState = { ok: false };
const commitInitial: BatchRunState = { ok: false };

type BatchUploadFormProps = {
  classroomId?: string;
  /** Limits come from the server (batch-schemas.ts) so the text can never drift from the check. */
  maxRows: number;
  maxCsvBytes: number;
};

export function BatchUploadForm({ classroomId, maxRows, maxCsvBytes }: BatchUploadFormProps) {
  const [csv, setCsv] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewState, previewAction, previewPending] = useActionState(
    previewBatchAction,
    previewInitial,
  );
  const [commitState, commitAction, commitPending] = useActionState(
    commitBatchAction,
    commitInitial,
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) {
      setCsv("");
      return;
    }
    if (file.size > maxCsvBytes) {
      setCsv("");
      setFileError(`파일이 너무 큽니다. (최대 ${Math.floor(maxCsvBytes / 1024)}KB)`);
      return;
    }
    setCsv(await file.text());
  }

  const done = commitState.ok && commitState.summary;
  const canCommit =
    previewState.ok && previewState.batchId && previewState.commitToken && !done;

  return (
    <div className="space-y-8">
      {!done ? (
        <form action={previewAction} className="space-y-4" aria-describedby="csv-help">
          <div>
            <label htmlFor="csvFile" className="block text-sm font-medium">
              학생 명단 CSV 파일
            </label>
            <input
              id="csvFile"
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              required
              aria-invalid={fileError ? true : undefined}
              className="mt-1 block w-full text-sm"
            />
            <p id="csv-help" className="mt-1 text-xs text-slate-600">
              UTF-8 CSV, 첫 줄에 <code>이름, 학번, 학년</code> 열이 있어야 합니다. 한 번에 최대
              {maxRows}명까지 가능합니다. 더 많으면 파일을 나누어 올려 주세요.
            </p>
          </div>
          <input type="hidden" name="csv" value={csv} />
          {classroomId ? <input type="hidden" name="classroomId" value={classroomId} /> : null}

          {fileError ? (
            <p role="alert" className="text-sm text-red-600">
              {fileError}
            </p>
          ) : null}
          {!previewState.ok && previewState.error ? (
            <p role="alert" className="text-sm text-red-600">
              {previewState.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={previewPending || !csv}
            className="rounded-md border border-slate-900 px-4 py-2 disabled:opacity-50"
          >
            {previewPending ? "확인 중..." : "미리보기"}
          </button>
        </form>
      ) : null}

      {previewState.ok && previewState.preview && !done ? (
        <BatchPreviewTable preview={previewState.preview} />
      ) : null}

      {canCommit ? (
        <form action={commitAction} className="space-y-3">
          <input type="hidden" name="csv" value={csv} />
          {classroomId ? <input type="hidden" name="classroomId" value={classroomId} /> : null}
          <input type="hidden" name="batchId" value={previewState.batchId} />
          <input type="hidden" name="commitToken" value={previewState.commitToken} />
          {!commitState.ok && commitState.error ? (
            <p role="alert" className="text-sm text-red-600">
              {commitState.error}
            </p>
          ) : null}
          <p className="text-xs text-slate-600">
            {classroomId ? "생성된 학생은 이 학급에 자동으로 등록됩니다. " : ""}확인 후 생성하면 되돌릴 수 없습니다. 미리보기는 15분 동안만 유효합니다.
          </p>
          <button
            type="submit"
            disabled={commitPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {commitPending
              ? "계정 생성 중..."
              : `${previewState.preview?.valid.length ?? 0}명 계정 생성`}
          </button>
        </form>
      ) : null}

      {done ? (
        <BatchResultPanel
          summary={commitState.summary!}
          credentialCsv={commitState.credentialCsv ?? ""}
        />
      ) : null}
    </div>
  );
}
