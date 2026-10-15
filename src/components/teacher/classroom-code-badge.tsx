"use client";

import { useState } from "react";

type Props = { code: string };

/** Read-only classroom code with a copy button. */
export function ClassroomCodeBadge({ code }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm text-slate-600">학급 코드</span>
      <code
        aria-label={`학급 코드 ${code.split("").join(" ")}`}
        className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm tracking-widest"
      >
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
      >
        복사
      </button>
      <span role="status" aria-live="polite" className="text-xs text-slate-600">
        {status === "copied" ? "복사했습니다." : status === "failed" ? "복사하지 못했습니다." : ""}
      </span>
    </div>
  );
}
