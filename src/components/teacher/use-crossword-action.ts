"use client";

import { startTransition, useActionState } from "react";
import type { CrosswordActionState } from "@/features/crossword/review/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CrosswordAction = (prev: unknown, formData: FormData) => Promise<CrosswordActionState<any>>;

/** Shown when the request itself failed (network down, server error): the screen never goes blank or throws. */
export const REQUEST_FAILED_MESSAGE =
  "요청을 처리하지 못했습니다. 연결을 확인하고 잠시 후 다시 시도해 주세요.";

/**
 * Runs one of the crossword server actions. The actions take a FormData with a single `payload` field holding JSON,
 * so every screen sends data the same way and the server validates it with the same schemas.
 * A rejected request becomes an ordinary error state instead of an unhandled error boundary.
 */
export function useCrosswordAction<A extends CrosswordAction>(action: A) {
  type Result = Awaited<ReturnType<A>>;
  const reducer = async (
    _previous: Result | undefined,
    formData: FormData,
  ): Promise<Result | undefined> => {
    try {
      return (await action(undefined, formData)) as Result;
    } catch {
      return { ok: false, error: REQUEST_FAILED_MESSAGE } as unknown as Result;
    }
  };
  const [state, run, pending] = useActionState(reducer, undefined);
  const submit = (payload: unknown) => {
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(() => run(fd));
  };
  return { state, submit, pending };
}
