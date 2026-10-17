import type { ReadinessResult } from "@/features/crossword/readiness";

type Props = { readiness: ReadinessResult; title?: string };

const BAND_STYLE = {
  ready: "border-green-700 text-green-800",
  needs_work: "border-amber-600 text-amber-800",
  blocked: "border-red-700 text-red-800",
} as const;

const SEVERITY_LABEL = { info: "안내", warning: "주의", blocking: "막힘" } as const;

/** Readiness of a word set before generating (plan §6): score, band, measures and advice. It never blocks the button. */
export function CrosswordReadinessPanel({ readiness, title = "낱말 퍼즐 준비도" }: Props) {
  const m = readiness.measures;
  return (
    <section
      aria-labelledby="readiness-title"
      className={`rounded-md border-2 p-4 ${BAND_STYLE[readiness.band]}`}
    >
      <h2 id="readiness-title" className="text-base font-semibold">
        {title}: {readiness.label} <span className="font-normal">({readiness.score}/100)</span>
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-800 sm:grid-cols-4">
        <div>
          <dt className="text-slate-600">쓸 수 있는 단어</dt>
          <dd>{m.eligible}개</dd>
        </div>
        <div>
          <dt className="text-slate-600">가장 큰 연결 묶음</dt>
          <dd>{m.largestGroup}개</dd>
        </div>
        <div>
          <dt className="text-slate-600">시험 퍼즐에 들어간 단어</dt>
          <dd>{m.probePlaced}개</dd>
        </div>
        <div>
          <dt className="text-slate-600">겹치는 글자가 없는 단어</dt>
          <dd>{m.isolated}개</dd>
        </div>
      </dl>
      {readiness.messages.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-slate-900">
          {readiness.messages.map((msg, i) => (
            <li key={`${msg.code}-${i}`}>
              <span className="mr-1 rounded border border-slate-400 px-1 text-xs">
                {SEVERITY_LABEL[msg.severity]}
              </span>
              {msg.text}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-slate-600">
        준비도는 참고용입니다. 준비되지 않은 세트도 생성해 볼 수 있으며, 이유가 표시됩니다.
      </p>
    </section>
  );
}
