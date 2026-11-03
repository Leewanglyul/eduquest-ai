"use client";

/**
 * The thin client hook of the Korean IME model (doc 08 C.7): one uncontrolled <input> holds focus, the cells are
 * visual, and every DOM event is translated into an ImeEvent for the pure ImeController. All decisions (what is
 * pending, what is committed, where the selection goes) are the controller's; this file only
 *   - never lets React write `value` (the input is uncontrolled), and never resets it while a composition is open
 *     (R2: the deferred reset asks the controller at the moment it runs);
 *   - prevents the default of a key the controller handled (Backspace, arrows) and of a paste.
 * It is exercised on the real devices of the G.5 validation; there is no browser test infrastructure yet (E.7).
 */
import { useCallback, useMemo, useRef } from "react";
import type { ClipboardEvent, CompositionEvent, FormEvent, KeyboardEvent } from "react";
import { ImeController, type ImeEvent, type ImeWord, type Intent } from "@/features/crossword/play/ime/controller";
import type { CrosswordInputMode } from "@/features/crossword/play/types";
import type { TraceEvent } from "./ime-trace";

export type GridInputOptions = {
  /** The puzzle's input mode (PLAY-E5-1); fixed for the life of the board. */
  inputMode?: CrosswordInputMode;
  /** Called after every event and flush, once the controller has handled it, while no composition is open. */
  onSettled?: () => void;
};

export function useGridInput(
  onIntents: (intents: Intent[]) => void,
  onTrace?: (event: TraceEvent) => void,
  options: GridInputOptions = {},
) {
  const inputMode = options.inputMode;
  const controller = useMemo(() => new ImeController(undefined, { inputMode }), [inputMode]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const emitRef = useRef(onIntents);
  emitRef.current = onIntents;
  const traceRef = useRef(onTrace);
  traceRef.current = onTrace;
  const settledRef = useRef(options.onSettled);
  settledRef.current = options.onSettled;
  const settle = useCallback(() => {
    if (!controller.state.composing) settledRef.current?.();
  }, [controller]);

  const run = useCallback(
    (event: ImeEvent): Intent[] => {
      traceRef.current?.(event);
      const intents = controller.handle(event);
      if (intents.length > 0) emitRef.current(intents);
      settle();
      return intents;
    },
    [controller, settle],
  );

  /** R2: reset the input value later, but only if no composition is open when the reset runs. */
  const resetLater = useCallback(() => {
    setTimeout(() => {
      const el = inputRef.current;
      if (el && controller.canResetInput() && el.value !== "") {
        el.value = "";
        controller.inputWasReset();
      }
    }, 0);
  }, [controller]);

  const inputProps = {
    ref: inputRef,
    onCompositionStart: () => {
      run({ type: "compositionstart" });
    },
    onCompositionUpdate: (e: CompositionEvent<HTMLInputElement>) => {
      run({ type: "compositionupdate", data: e.data });
    },
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      run({ type: "compositionend", data: e.data, value: e.currentTarget.value });
      resetLater();
    },
    onInput: (e: FormEvent<HTMLInputElement>) => {
      const ne = e.nativeEvent as InputEvent;
      run({ type: "input", inputType: ne.inputType ?? "", data: ne.data ?? null, isComposing: Boolean(ne.isComposing), value: e.currentTarget.value });
      if (!ne.isComposing) resetLater();
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      const intents = run({
        type: "keydown",
        key: e.key,
        keyCode: e.keyCode,
        isComposing: e.nativeEvent.isComposing,
        valueEmpty: e.currentTarget.value === "",
      });
      if (intents.length > 0) e.preventDefault();
    },
    onBlur: () => {
      run({ type: "blur" });
    },
    onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      run({ type: "paste", text: e.clipboardData.getData("text") });
    },
    // Not a password or an address: stop the keyboard from "helping" (R4).
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
  } as const;

  return {
    inputProps,
    inputRef,
    focus: () => inputRef.current?.focus(),
    setWord: (word: ImeWord) => {
      traceRef.current?.({ type: "setWord", word });
      controller.setWord(word);
    },
    /** The student tapped another cell of the word. */
    select: (index: number): Intent[] => run({ type: "select", index }),
    /** Commit a pending syllable (save, submit, leaving). */
    flush: (): Intent[] => {
      traceRef.current?.({ type: "flush" });
      const intents = controller.flush();
      if (intents.length > 0) emitRef.current(intents);
      settle();
      return intents;
    },
    isComposing: () => controller.state.composing,
  };
}
