"use client";

/**
 * The finishing moment (doc 08 D.3.1). A banner ABOVE the puzzle (it never covers, blurs or fades a cell or a clue):
 * the congratulation line and a bar that sweeps across it for about a second and a half. No flashing, no sound. With
 * "reduce motion" the bar does not move and nothing advances on its own. One tap, Enter or Escape goes on to the result
 * page at once; otherwise it goes there by itself after a short while. Announced once, politely.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PLAY_TEXT } from "@/features/crossword/play/messages";

export function CompletionMoment({ resultHref }: { resultHref: string }) {
  const router = useRouter();
  const [reduced, setReduced] = useState<boolean | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(resultHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, resultHref]);

  useEffect(() => {
    if (reduced !== false) return; // reduced motion (or not known yet): never move on by itself
    const t = setTimeout(() => router.push(resultHref), 2600);
    return () => clearTimeout(t);
  }, [reduced, router, resultHref]);

  return (
    <section
      role="status"
      aria-live="polite"
      data-reduced-motion={reduced === null ? "unknown" : String(reduced)}
      className="relative overflow-hidden rounded-lg border-2 border-emerald-800 bg-emerald-50 p-4 text-emerald-950"
    >
      <div aria-hidden="true" className="play-sweep absolute inset-x-0 bottom-0 h-1.5 bg-emerald-700" data-testid="completion-sweep" />
      <p className="text-xl font-bold">{PLAY_TEXT.completed}</p>
      <p className="mt-1 text-sm">결과 화면에서 내가 푼 퍼즐을 볼 수 있어요.</p>
      <button
        ref={button}
        type="button"
        onClick={() => router.push(resultHref)}
        className="mt-3 min-h-12 rounded border border-emerald-900 bg-white px-4 py-2 text-base font-semibold"
      >
        결과 보기
      </button>
    </section>
  );
}
