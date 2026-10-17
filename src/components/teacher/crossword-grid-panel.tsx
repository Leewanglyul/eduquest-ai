"use client";

import { useState } from "react";
import type { ViewWord } from "@/features/crossword/review/view-model";
import { CrosswordGridView } from "./crossword-grid-view";

type Props = {
  rows: number;
  cols: number;
  words: readonly ViewWord[];
  highlightKeys?: readonly string[];
};

/** The board with a "show solution" switch. The solution is on by default: this is the teacher area. */
export function CrosswordGridPanel({ rows, cols, words, highlightKeys }: Props) {
  const [showSolution, setShowSolution] = useState(true);
  return (
    <div className="space-y-2">
      <label className="text-sm">
        <input
          type="checkbox"
          checked={showSolution}
          onChange={(e) => setShowSolution(e.target.checked)}
        />{" "}
        정답 보기
      </label>
      <CrosswordGridView
        rows={rows}
        cols={cols}
        words={words}
        showSolution={showSolution}
        highlightKeys={highlightKeys}
      />
    </div>
  );
}
