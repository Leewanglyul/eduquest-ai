"use client";

/** The device-test panel shown only with ?imetrace=1 (doc 09 section 5). Memory only, nothing is sent. */
import { useState } from "react";
import type { ImeTrace } from "./ime-trace";

export function ImeTracePanel({ trace, count, onClear }: { trace: ImeTrace; count: number; onClear: () => void }) {
  const [device, setDevice] = useState("");
  const [keyboard, setKeyboard] = useState("");
  const [prediction, setPrediction] = useState(false);
  const [note, setNote] = useState("");

  const download = () => {
    const fixture = trace.toFixture({
      device: device || "unnamed device",
      keyboardApp: keyboard,
      predictionStrip: prediction,
      orientation: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? "landscape" : "portrait"),
      viewport: [innerWidth, innerHeight],
      userAgent: navigator.userAgent,
      note,
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(fixture)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ime-board-${(device || "device").replace(/[^\w가-힣]+/g, "_")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const field = "mt-1 block w-full rounded border border-slate-600 p-2";
  return (
    <section aria-label="IME 기록" className="mt-6 space-y-2 rounded border border-dashed border-amber-800 p-3 text-sm">
      <h2 className="font-semibold">IME 기록 (기기 점검용 · 시험 계정에서만)</h2>
      <p>입력한 내용이 기록에 들어갑니다. 파일은 이 기기에만 저장되고 어디로도 전송되지 않습니다. 기록된 이벤트 {count}개.</p>
      <label className="block">
        기기 / 브라우저 (예: Tab S9 / Samsung Internet)
        <input value={device} onChange={(e) => setDevice(e.target.value)} className={field} style={{ fontSize: 16 }} />
      </label>
      <label className="block">
        키보드 앱 (삼성 키보드, Gboard, Microsoft IME …)
        <input value={keyboard} onChange={(e) => setKeyboard(e.target.value)} className={field} style={{ fontSize: 16 }} />
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={prediction} onChange={(e) => setPrediction(e.target.checked)} className="h-5 w-5" /> 추천 단어 줄(예측) 켜 둠
      </label>
      <label className="block">
        메모 (이상한 점)
        <input value={note} onChange={(e) => setNote(e.target.value)} className={field} style={{ fontSize: 16 }} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={download} className="min-h-12 rounded border border-slate-600 px-3">
          기록 내려받기 (JSON)
        </button>
        <button type="button" onClick={onClear} className="min-h-12 rounded border border-slate-600 px-3">
          기록 지우기
        </button>
      </div>
    </section>
  );
}
