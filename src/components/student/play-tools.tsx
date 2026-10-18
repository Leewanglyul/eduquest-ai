/**
 * The hint tools, as tools and not penalties: check, reveal a letter, 초성, and submit. Only what the puzzle allows is
 * shown; the counts are facts about what is left ("남은 3번"). Buttons are at least 48px tall for a finger.
 */
import type { PlayLimits } from "@/features/crossword/play/types";

type Props = {
  limits: PlayLimits;
  disabled: boolean;
  canSubmit: boolean;
  onCheck: (scope: "cell" | "word" | "puzzle") => void;
  onReveal: () => void;
  onChosung: () => void;
  onSubmit: () => void;
};

const BASE = "min-h-12 rounded border px-3 py-2 text-sm font-medium sm:px-4 sm:text-base disabled:cursor-not-allowed disabled:opacity-60";
const BTN = `${BASE} border-slate-600 bg-white text-slate-900`;
const SUBMIT = `${BASE} ml-auto border-slate-900 bg-slate-900 text-white`;

export function PlayTools({ limits, disabled, canSubmit, onCheck, onReveal, onChosung, onSubmit }: Props) {
  const anytime = limits.checkMode === "anytime";
  const checksLeft = limits.checksRemaining;
  const checkBlocked = limits.checkMode === "submitOnly" || limits.checksAllowed === 0 || (checksLeft !== null && checksLeft <= 0);
  const left = checksLeft === null ? "" : ` (남은 ${checksLeft}번)`;
  return (
    <div role="group" aria-label="도구" className="flex flex-wrap items-center gap-2">
      {limits.checkMode !== "submitOnly" && limits.checksAllowed !== 0 ? (
        <>
          {anytime ? (
            <button type="button" className={BTN} disabled={disabled || checkBlocked} onClick={() => onCheck("cell")}>
              칸 확인{left}
            </button>
          ) : null}
          <button type="button" className={BTN} disabled={disabled || checkBlocked} onClick={() => onCheck("word")}>
            낱말 확인{left}
          </button>
          {anytime ? (
            <button type="button" className={BTN} disabled={disabled || checkBlocked} onClick={() => onCheck("puzzle")}>
              전체 확인{left}
            </button>
          ) : null}
        </>
      ) : null}
      {limits.revealsAllowed > 0 ? (
        <button type="button" className={BTN} disabled={disabled || limits.revealsRemaining <= 0} onClick={onReveal}>
          글자 알려주기 (남은 {limits.revealsRemaining}번)
        </button>
      ) : null}
      {limits.chosungAllowed ? (
        <button type="button" className={BTN} disabled={disabled} onClick={onChosung}>
          초성 보기
        </button>
      ) : null}
      <button type="button" className={SUBMIT} disabled={disabled || !canSubmit} onClick={onSubmit}>
        제출
      </button>
    </div>
  );
}
