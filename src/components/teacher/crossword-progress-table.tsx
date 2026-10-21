import type { ProgressRow } from "@/features/crossword/results/types";
import {
  PROGRESS_STATE_LABEL,
  PROGRESS_TEXT,
  lastActivityOf,
  progressText,
  toolsText,
  whenText,
  wrongSubmitsText,
} from "@/features/crossword/results/view-model";
import { ScrollRegion } from "./crossword-ui";

type Props = { rows: ProgressRow[]; caption: string };

const TH = "border border-slate-200 px-2 py-1";
const TD = "border border-slate-200 px-2 py-1";

/**
 * The progress of one assignment: one row per enrolled student, in the order given (student number, then name). State is
 * text plus an icon, never colour alone. Counts only: the table has no letters, answers or grid.
 */
export function CrosswordProgressTable({ rows, caption }: Props) {
  if (rows.length === 0) {
    return (
      <p role="status" className="text-sm text-slate-700">
        {PROGRESS_TEXT.empty}
      </p>
    );
  }
  const c = PROGRESS_TEXT.columns;
  return (
    <ScrollRegion label={`${caption} 표 (가로로 밀어서 볼 수 있어요)`}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-slate-100 text-left">
            <th scope="col" className={TH}>{c.no}</th>
            <th scope="col" className={TH}>{c.name}</th>
            <th scope="col" className={TH}>{c.state}</th>
            <th scope="col" className={TH}>{c.progress}</th>
            <th scope="col" className={TH}>{c.lastActivity}</th>
            <th scope="col" className={TH}>{c.tools}</th>
            <th scope="col" className={TH}>{c.wrong}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const state = PROGRESS_STATE_LABEL[r.state];
            return (
              <tr key={r.studentId}>
                <td className={`${TD} tabular-nums`}>{r.studentNo}</td>
                <th scope="row" className={`${TD} text-left font-normal`}>{r.displayName}</th>
                <td className={TD}>
                  <span aria-hidden="true">{state.icon} </span>
                  {state.text}
                </td>
                <td className={`${TD} tabular-nums`}>{progressText(r)}</td>
                <td className={`${TD} tabular-nums`}>{whenText(lastActivityOf(r))}</td>
                <td className={TD}>{toolsText(r)}</td>
                <td className={`${TD} tabular-nums`}>{wrongSubmitsText(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
