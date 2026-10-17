"use client";

import { startTransition, useActionState, useState } from "react";
import {
  commitContentImportAction,
  previewContentImportAction,
  type ContentPreviewState,
  type ContentRunState,
} from "@/features/content/import/actions";
import { ContentPreviewTable } from "./content-preview-table";
import { ContentResultPanel } from "./content-result-panel";

const previewInitial: ContentPreviewState = { ok: false };
const commitInitial: ContentRunState = { ok: false };

export type ContentImportLimits = {
  maxRows: number;
  maxCsvBytes: number;
  maxSetEntries: number;
  maxTermChars: number;
  maxDefinitionChars: number;
  answerMinLen: number;
  answerMaxLen: number;
  tokenMinutes: number;
};

type Props = {
  /** Undefined: create a new set. Otherwise: add to or replace this set. */
  existingSet?: { id: string; title: string; liveCount: number };
  classrooms?: { id: string; name: string }[];
  /** Limits come from the server (content-schemas.ts) so the text can never drift from the checks. */
  limits: ContentImportLimits;
  sampleHref: string;
};

export function ContentImportForm({ existingSet, classrooms = [], limits, sampleHref }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [existingMode, setExistingMode] = useState<"append" | "replace">("append");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);

  const [previewState, previewAction, previewPending] = useActionState(previewContentImportAction, previewInitial);
  const [commitState, commitAction, commitPending] = useActionState(commitContentImportAction, commitInitial);

  const mode = existingSet ? existingMode : "create";
  const signature = file ? [file.name, file.size, file.lastModified, mode, newSetTitle, classroomId].join("|") : "";
  const maxKb = Math.floor(limits.maxCsvBytes / 1024);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFileError(null);
    setFile(null);
    if (!picked) return;
    // Convenience only: the server repeats the size check before it reads the file.
    if (picked.size > limits.maxCsvBytes) {
      setFileError(`파일이 너무 큽니다. 최대 ${maxKb}KB까지 올릴 수 있습니다.`);
      return;
    }
    setFile(picked);
  }

  function fields(): FormData {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("mode", mode);
    if (existingSet) fd.set("setId", existingSet.id);
    else {
      fd.set("newSetTitle", newSetTitle);
      if (classroomId) fd.set("classroomId", classroomId);
    }
    return fd;
  }

  function runPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPreviewedFor(signature);
    setConfirmReplace(false);
    startTransition(() => previewAction(fields()));
  }

  function runCommit() {
    const fd = fields();
    fd.set("batchId", previewState.batchId ?? "");
    fd.set("commitToken", previewState.commitToken ?? "");
    if (mode === "replace" && confirmReplace) fd.set("confirmReplace", "true");
    startTransition(() => commitAction(fd));
  }

  const done = commitState.ok && commitState.result;
  const stale = previewedFor !== null && previewedFor !== signature;
  const canCommit = previewState.ok && !!previewState.batchId && !!previewState.commitToken && !done && !stale;
  const preview = previewState.preview;
  const willArchive = preview?.willArchive ?? 0;

  return (
    <div className="space-y-8">
      {!done ? (
        <form onSubmit={runPreview} className="space-y-4" aria-describedby="content-csv-help">
          {existingSet ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                「{existingSet.title}」 (현재 단어 {existingSet.liveCount}개)
              </legend>
              <label className="mr-4 text-sm">
                <input type="radio" name="existingMode" checked={existingMode === "append"} onChange={() => setExistingMode("append")} /> 단어 추가
              </label>
              <label className="text-sm">
                <input type="radio" name="existingMode" checked={existingMode === "replace"} onChange={() => setExistingMode("replace")} /> 전체 바꾸기
              </label>
            </fieldset>
          ) : (
            <>
              <div>
                <label htmlFor="newSetTitle" className="block text-sm font-medium">세트 이름</label>
                <input
                  id="newSetTitle"
                  type="text"
                  value={newSetTitle}
                  onChange={(e) => setNewSetTitle(e.target.value)}
                  maxLength={80}
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              {classrooms.length > 0 ? (
                <div>
                  <label htmlFor="classroomId" className="block text-sm font-medium">학급 (선택)</label>
                  <select
                    id="classroomId"
                    value={classroomId}
                    onChange={(e) => setClassroomId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="">학급 없이 나만 사용</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}

          <div>
            <label htmlFor="contentCsvFile" className="block text-sm font-medium">단어 CSV 파일</label>
            <input
              id="contentCsvFile"
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              required
              aria-invalid={fileError ? true : undefined}
              className="mt-1 block w-full text-sm"
            />
            <p id="content-csv-help" className="mt-1 text-xs text-slate-600">
              UTF-8 CSV, 첫 줄에 <code>term, definition</code> 열(또는 <code>용어, 뜻</code>)이 있어야 합니다. 한 번에 최대{" "}
              {limits.maxRows}개, {maxKb}KB까지 올릴 수 있고 한 세트에는 최대 {limits.maxSetEntries}개까지 담을 수 있습니다. 정답은{" "}
              {limits.answerMinLen}~{limits.answerMaxLen}글자의 한글·영문·숫자여야 합니다.{" "}
              <a href={sampleHref} className="underline" download>예시 파일 내려받기</a>
            </p>
            <p className="mt-1 text-xs font-medium text-slate-700">학생 이름, 학번 등 개인정보는 넣지 마세요.</p>
          </div>

          {fileError ? <p role="alert" className="text-sm text-red-600">{fileError}</p> : null}
          {!previewState.ok && previewState.error ? (
            <p role="alert" className="text-sm text-red-600">{previewState.error}</p>
          ) : null}

          <button
            type="submit"
            disabled={previewPending || !file}
            className="rounded-md border border-slate-900 px-4 py-2 disabled:opacity-50"
          >
            {previewPending ? "확인하는 중..." : "미리보기"}
          </button>
        </form>
      ) : null}

      {preview && !done ? <ContentPreviewTable preview={preview} /> : null}

      {stale && !done ? (
        <p role="status" className="text-sm text-amber-700">
          파일이나 설정이 바뀌었습니다. 다시 미리보기를 실행해 주세요.
        </p>
      ) : null}

      {canCommit && preview ? (
        <div className="space-y-3">
          {mode === "replace" ? (
            <label className="block text-sm">
              <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} /> 기존 단어{" "}
              {willArchive}개를 보관 처리하고 {preview.valid.length}개로 바꿉니다.
            </label>
          ) : null}
          {!commitState.ok && commitState.error ? (
            <p role="alert" className="text-sm text-red-600">{commitState.error}</p>
          ) : null}
          <p className="text-xs text-slate-600">
            미리보기는 {limits.tokenMinutes}분 동안만 유효하며 한 번만 저장할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={runCommit}
            disabled={commitPending || (mode === "replace" && !confirmReplace)}
            className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {commitPending
              ? "저장하는 중..."
              : preview.counts.rejected > 0
                ? `오류 ${preview.counts.rejected}개를 제외하고 ${preview.valid.length}개 저장`
                : `${preview.valid.length}개 저장`}
          </button>
        </div>
      ) : null}

      {done ? <ContentResultPanel result={commitState.result!} /> : null}
    </div>
  );
}
