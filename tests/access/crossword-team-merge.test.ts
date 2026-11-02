import { describe, expect, it } from "vitest";

import { lockedPendingKeys, mergeTeamCells, teamLimits, teammateChanges } from "@/features/crossword/play/team";
import type { PlayLimits } from "@/features/crossword/play/types";

// M2-3.4 P3 checkpoint: the pure merge rules K-1 to K-5 and the shared tool counters (D-6).

const none = new Map<string, string | null>();

describe("mergeTeamCells", () => {
  it("K-1: server cells, overlaid by this student's unconfirmed cells (a null clears)", () => {
    const merged = mergeTeamCells({
      server: { "0,0": "사", "0,1": "과", "1,1": "일" },
      given: {},
      unconfirmed: new Map<string, string | null>([["0,1", "고"], ["1,1", null], ["2,2", "도"]]),
      composing: [],
      current: {},
    });
    expect(merged).toEqual({ "0,0": "사", "0,1": "고", "2,2": "도" });
  });

  it("K-2: the cells being composed keep what the screen shows, whatever the server says", () => {
    const merged = mergeTeamCells({
      server: { "0,0": "사", "0,1": "과" },
      given: {},
      unconfirmed: none,
      composing: ["0,0", "0,1", "0,2"],
      current: { "0,0": "새" },
    });
    expect(merged).toEqual({ "0,0": "새" });
  });

  it("K-5: given cells (prefilled or revealed by a teammate) are never kept as typed cells", () => {
    const merged = mergeTeamCells({
      server: { "0,0": "사", "0,1": "과" },
      given: { "0,1": "과", "1,1": "일" },
      unconfirmed: new Map([["1,1", "이"]]),
      composing: ["1,1"],
      current: { "1,1": "이" },
    });
    expect(merged).toEqual({ "0,0": "사" });
  });

  it("does not change its inputs", () => {
    const server = { "0,0": "사" };
    mergeTeamCells({ server, given: { "0,0": "사" }, unconfirmed: none, composing: [], current: {} });
    expect(server).toEqual({ "0,0": "사" });
  });
});

describe("lockedPendingKeys", () => {
  it("lists the unconfirmed cells that have become given", () => {
    expect(lockedPendingKeys(new Map([["0,0", "사"], ["0,1", null], ["2,2", "도"]]), { "0,1": "과", "2,2": "도" })).toEqual(["0,1", "2,2"]);
    expect(lockedPendingKeys(none, { "0,1": "과" })).toEqual([]);
  });
});

describe("teammateChanges (K-4, neutral: keys only, never who)", () => {
  const prev = { cells: { "0,0": "사", "0,1": "과", "1,1": "일" }, otherKeys: ["1,1"] };

  it("reports a cell I wrote that a teammate rewrote with another letter", () => {
    expect(teammateChanges(prev, { cells: { "0,0": "새", "0,1": "과", "1,1": "일" }, otherKeys: ["0,0", "1,1"] }, none)).toEqual(["0,0"]);
  });

  it("does not report a teammate's own cell, an unchanged letter, or the first snapshot", () => {
    expect(teammateChanges(prev, { cells: { "0,0": "사", "0,1": "과", "1,1": "이" }, otherKeys: ["0,0", "1,1"] }, none)).toEqual([]);
    expect(teammateChanges(null, { cells: { "0,0": "새" }, otherKeys: ["0,0"] }, none)).toEqual([]);
  });

  it("does not report a cell I am changing myself right now", () => {
    expect(teammateChanges(prev, { cells: { "0,0": "새", "0,1": "과", "1,1": "일" }, otherKeys: ["0,0", "1,1"] }, new Map([["0,0", "삭"]]))).toEqual([]);
  });

  it("returns cell keys only", () => {
    const out = teammateChanges(prev, { cells: { "0,0": "새", "0,1": "과", "1,1": "일" }, otherKeys: ["0,0", "1,1"] }, none);
    for (const k of out) expect(k).toMatch(/^\d{1,2},\d{1,2}$/);
  });
});

describe("teamLimits (D-6 shared budget)", () => {
  const limits: PlayLimits = { checkMode: "anytime", checksAllowed: 5, checksRemaining: 5, revealsAllowed: 3, revealsRemaining: 3, chosungAllowed: true };
  it("counts down from the team's shared use, never below zero", () => {
    expect(teamLimits(limits, { checks: 2, reveals: 1 })).toMatchObject({ checksRemaining: 3, revealsRemaining: 2 });
    expect(teamLimits(limits, { checks: 9, reveals: 9 })).toMatchObject({ checksRemaining: 0, revealsRemaining: 0 });
  });
  it("unlimited checks stay unlimited", () => {
    expect(teamLimits({ ...limits, checksAllowed: null, checksRemaining: null }, { checks: 4, reveals: 0 }).checksRemaining).toBeNull();
  });
});
