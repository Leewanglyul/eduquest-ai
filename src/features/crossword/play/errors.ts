import "server-only";

import { playErrorCode } from "./messages";
import type { PlayErrorCode } from "./types";

/** A refusal of the play rules, carrying one of the stable codes. `seconds` is the cooldown wait, when there is one. */
export class PlayError extends Error {
  constructor(
    public readonly code: PlayErrorCode,
    public readonly seconds?: number,
  ) {
    super(`CROSSWORD_PLAY_${code}`);
    this.name = "PlayError";
  }
}

type DbError = { message: string; hint?: string | null };

/** Our P0001 codes become PlayError; anything else is a bug (or an outage) and is rethrown as it is. */
export function unwrapPlay<T>(result: { data: unknown; error: DbError | null }): T {
  if (result.error) {
    const code = playErrorCode(result.error.message);
    if (code) {
      const seconds = result.error.hint !== null && result.error.hint !== undefined ? Number(result.error.hint) : undefined;
      throw new PlayError(code, Number.isFinite(seconds) ? seconds : undefined);
    }
    throw result.error;
  }
  return result.data as T;
}
