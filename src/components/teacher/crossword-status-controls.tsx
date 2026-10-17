"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  archiveCrosswordAction,
  createCrosswordVersionAction,
  unarchiveCrosswordAction,
} from "@/features/crossword/review/actions";
import { useCrosswordAction } from "./use-crossword-action";

type Props = {
  puzzleId: string;
  status: "draft" | "published" | "archived";
  /** The puzzle was published at some time: it can get a new version but cannot be restored from the archive. */
  wasPublished: boolean;
  /** A newer version exists (a draft or a published one): no further version can be made from this one. */
  hasNewerVersion: boolean;
};

/** Archive / restore and "new version". Published puzzles are frozen: this is how they change. */
export function CrosswordStatusControls({
  puzzleId,
  status,
  wasPublished,
  hasNewerVersion,
}: Props) {
  const router = useRouter();
  const archive = useCrosswordAction(archiveCrosswordAction);
  const restore = useCrosswordAction(unarchiveCrosswordAction);
  const version = useCrosswordAction(createCrosswordVersionAction);

  useEffect(() => {
    if (archive.state?.ok || restore.state?.ok) router.refresh();
  }, [archive.state, restore.state, router]);
  useEffect(() => {
    if (version.state?.ok) router.push(`/teacher/crosswords/${version.state.data.puzzleId}`);
  }, [version.state, router]);

  const error = [archive.state, restore.state, version.state].find((s) => s && !s.ok);
  const busy = archive.pending || restore.pending || version.pending;

  return (
    <section aria-labelledby="status-title" className="space-y-3">
      <h2 id="status-title" className="text-base font-semibold">
        관리
      </h2>
      {wasPublished && !hasNewerVersion ? (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => version.submit({ id: puzzleId })}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {version.pending ? "만드는 중..." : "새 버전 만들기"}
          </button>
          <p className="mt-1 text-xs text-slate-600">
            현재 퍼즐을 복사해 새 초안을 만듭니다. 힌트 문장과 이름을 고친 뒤 다시 배포할 수 있고,
            이전 버전은 보관됩니다.
          </p>
        </div>
      ) : null}
      {status !== "archived" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                status === "published"
                  ? "이 퍼즐을 보관할까요? 열려 있는 배포가 모두 닫힙니다."
                  : "이 초안을 보관할까요? 언제든 복원할 수 있습니다.",
              )
            )
              archive.submit({ id: puzzleId });
          }}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {archive.pending ? "처리 중..." : "보관"}
        </button>
      ) : wasPublished ? (
        <p className="text-sm text-slate-600">
          배포한 적이 있는 퍼즐은 복원할 수 없습니다. 새 버전을 만들어 사용하세요.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => restore.submit({ id: puzzleId })}
          className="rounded-md border border-slate-900 px-4 py-2 text-sm disabled:opacity-50"
        >
          {restore.pending ? "처리 중..." : "초안으로 복원"}
        </button>
      )}
      {error && !error.ok ? (
        <p role="alert" className="text-sm text-red-600">
          {error.error}
        </p>
      ) : null}
    </section>
  );
}
