"use client";

import { startTransition, useActionState } from "react";
import type { CrosswordActionState } from "@/features/crossword/review/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CrosswordAction = (prev: unknown, formData: FormData) => Promise<CrosswordActionState<any>>;

/**
 * Runs one of the crossword server actions. The actions take a FormData with a single `payload` field holding JSON,
 * so every screen sends data the same way and the server validates it with the same schemas.
 */
export function useCrosswordAction<A extends CrosswordAction>(action: A) {
  type Result = Awaited<ReturnType<A>>;
  const reducer = async (
    _previous: Result | undefined,
    formData: FormData,
  ): Promise<Result | undefined> => (await action(undefined, formData)) as Result;
  const [state, run, pending] = useActionState(reducer, undefined);
  const submit = (payload: unknown) => {
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(() => run(fd));
  };
  return { state, submit, pending };
}
