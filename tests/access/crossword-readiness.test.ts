import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CROSSWORD_MIN_WORDS } from "@/features/crossword/generator/constants";
import type { CrosswordInputEntry } from "@/features/crossword/generator/types";
import {
  READINESS,
  READINESS_LABELS,
  computeReadiness,
  connectivityGroups,
} from "@/features/crossword/readiness";

const mk = (
  words: string[],
  clue = (w: string) => `${w}의 뜻을 설명하는 문장`,
): CrosswordInputEntry[] =>
  words.map((w, i) => ({ id: `e${String(i).padStart(2, "0")}`, answer: w, clue: clue(w) }));

const CHAIN = [
  "사과",
  "과일",
  "일기",
  "기차",
  "차표",
  "표지",
  "지도",
  "도서관",
  "관심",
  "심장",
  "장미",
  "미술",
  "술래",
  "내일",
  "일요일",
  "요리",
  "리본",
  "본문",
  "문제",
  "제주",
  "주말",
  "학교",
  "교실",
  "실내",
  "래프팅",
];
const SCIENCE = [
  "광합성",
  "합성",
  "성장",
  "장마",
  "마찰",
  "찰흙",
  "흙탕물",
  "물질",
  "질량",
  "양성자",
  "자석",
  "석유",
  "유리",
  "온도",
  "도시",
  "시간",
  "간장",
  "장력",
  "력도",
  "도자기",
];
const CIVICS = [
  "민주주의",
  "삼권분립",
  "헌법",
  "국민",
  "선거",
  "정당",
  "의회",
  "법원",
  "행정부",
  "입법부",
  "사법부",
  "국회",
  "대통령",
  "지방자치",
  "투표",
  "권력",
  "자유",
  "평등",
  "인권",
  "시민",
];
const noLeak = (w: string) => `${w.length}글자로 된 낱말`;

describe("approved thresholds (plan §6.2)", () => {
  it("are pinned", () => {
    expect(READINESS.fullAt).toBe(12);
    expect([READINESS.weightProbe, READINESS.weightConnected, READINESS.weightEligible]).toEqual([
      0.5, 0.25, 0.25,
    ]);
    expect(READINESS.weightProbe + READINESS.weightConnected + READINESS.weightEligible).toBe(1);
    expect(READINESS.readyScore).toBe(70);
    expect([READINESS.probeSeed, READINESS.probeAttempts, READINESS.probeGrid]).toEqual([
      0, 30, 15,
    ]);
    expect(CROSSWORD_MIN_WORDS).toBe(5); // the gate (decision C2) is the generator's minimum
    expect(READINESS_LABELS).toEqual({
      blocked: "만들기 어려움",
      needs_work: "보완 필요",
      ready: "준비됨",
    });
  });
});

describe("word connectivity analysis", () => {
  it("groups words joined by shared characters, largest first", () => {
    const groups = connectivityGroups([
      { id: "a", chars: ["사", "과"] },
      { id: "b", chars: ["과", "일"] },
      { id: "c", chars: ["일", "기"] },
      { id: "d", chars: ["헌", "법"] },
      { id: "e", chars: ["법", "원"] },
      { id: "f", chars: ["투", "표"] },
    ]);
    expect(groups).toEqual([["a", "b", "c"], ["d", "e"], ["f"]]);
  });

  it("joins words through a chain, not only pairs, and ignores repeated characters inside a word", () => {
    expect(
      connectivityGroups([
        { id: "x", chars: ["가", "가", "나"] },
        { id: "y", chars: ["나", "다"] },
        { id: "z", chars: ["다", "라"] },
      ]),
    ).toEqual([["x", "y", "z"]]);
  });

  it("is empty for no words", () => {
    expect(connectivityGroups([])).toEqual([]);
  });

  it("reports isolated words and the largest group on a real list", () => {
    const r = computeReadiness(mk(CIVICS));
    expect(r.measures.largestGroup).toBe(6);
    expect(r.measures.isolated).toBe(4);
    expect(r.groups.map((g) => g.length)).toEqual([6, 5, 3, 2, 1, 1, 1, 1]);
    expect(r.isolatedIds).toHaveLength(4);
    // every eligible word is in exactly one group
    expect(r.groups.flat().sort()).toEqual(
      mk(CIVICS)
        .map((e) => e.id)
        .sort(),
    );
  });
});

describe("readiness score and bands", () => {
  it("reproduces the plan's measured table", () => {
    const rows: [string, string[], number, string, number, number, number][] = [
      ["chain", CHAIN, 100, "ready", 25, 25, 17],
      ["science", SCIENCE, 100, "ready", 20, 20, 13],
      ["civics", CIVICS, 49, "blocked", 20, 6, 4],
      ["three words", ["사과", "과일", "일기"], 44, "blocked", 3, 3, 3],
    ];
    for (const [name, words, score, band, eligible, largest, placed] of rows) {
      const r = computeReadiness(mk(words));
      expect([
        name,
        r.score,
        r.band,
        r.measures.eligible,
        r.measures.largestGroup,
        r.measures.probePlaced,
      ]).toEqual([name, score, band, eligible, largest, placed]);
    }
  });

  it("an empty set scores 0 and is blocked", () => {
    const r = computeReadiness([]);
    expect(r.score).toBe(0);
    expect(r.band).toBe("blocked");
    expect(r.groups).toEqual([]);
    expect(r.messages.map((m) => m.code)).toEqual(["NO_ELIGIBLE_WORDS"]);
  });

  it("the gate sits at 5 placed words: 4 words blocked, 5 words not blocked", () => {
    const four = computeReadiness(mk(CHAIN.slice(0, 4)));
    const five = computeReadiness(mk(CHAIN.slice(0, 5)));
    expect(four.measures.probePlaced).toBe(4);
    expect(four.band).toBe("blocked");
    expect(five.measures.probePlaced).toBe(5);
    expect(five.band).not.toBe("blocked");
  });

  it("a set that can be generated but is small is 'needs work', not 'ready'", () => {
    const r = computeReadiness(mk(CHAIN.slice(0, 6)));
    expect(r.measures.probePlaced).toBeGreaterThanOrEqual(CROSSWORD_MIN_WORDS);
    expect(r.score).toBeLessThan(READINESS.readyScore);
    expect(r.band).toBe("needs_work");
    expect(r.label).toBe("보완 필요");
  });

  it("the gate wins over the score: enough words but too few placed is still blocked", () => {
    const r = computeReadiness(mk(CIVICS));
    expect(r.measures.eligible).toBeGreaterThan(READINESS.fullAt);
    expect(r.band).toBe("blocked");
  });

  it("score stays in 0..100 and does not rise when connected words are replaced by unrelated ones", () => {
    const connected = computeReadiness(mk(CHAIN.slice(0, 12)));
    const mixed = computeReadiness(
      mk([...CHAIN.slice(0, 6), "헌법", "투표", "선거", "정당", "의회", "법원"]),
    );
    for (const r of [connected, mixed]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
    expect(mixed.score).toBeLessThanOrEqual(connected.score);
  });

  it("is deterministic and does not depend on the order of the entries", () => {
    const entries = mk(SCIENCE);
    const a = computeReadiness(entries);
    expect(computeReadiness(entries)).toEqual(a);
    expect(computeReadiness([...entries].reverse())).toEqual(a);
  });
});

describe("what counts as eligible", () => {
  it("excludes emoji, spaces and duplicates with reasons, and counts one-character words apart", () => {
    const r = computeReadiness(mk([...CHAIN.slice(0, 8), "😀", "A B", "사과", "배"]));
    expect(r.measures.eligible).toBe(8);
    expect(r.measures.singles).toBe(1);
    expect(r.measures.excluded).toEqual({ INVALID_CHARACTERS: 2, DUPLICATE_ANSWER: 1 });
  });

  it("one-character words never connect anything", () => {
    const r = computeReadiness(mk([...CHAIN.slice(0, 6), "배"]));
    expect(r.groups.flat()).toHaveLength(6);
  });

  it("counts clues that contain the answer", () => {
    expect(computeReadiness(mk(CHAIN.slice(0, 6))).measures.clueLeaks).toBe(6);
    expect(computeReadiness(mk(CHAIN.slice(0, 6), noLeak)).measures.clueLeaks).toBe(0);
  });
});

describe("recommendation messages", () => {
  it("a good set says it is ready", () => {
    const r = computeReadiness(mk(CHAIN, noLeak));
    expect(r.messages.map((m) => m.code)).toEqual(["READY"]);
    expect(r.messages[0].text).toBe("이 단어 모음으로 낱말 퍼즐을 만들 수 있습니다.");
    expect(r.messages[0].severity).toBe("info");
  });

  it("a poor set names the isolated words, the small group and the probe result in Korean", () => {
    const r = computeReadiness(mk(CIVICS, noLeak));
    const byCode = Object.fromEntries(r.messages.map((m) => [m.code, m]));
    expect(byCode.PROBE_TOO_SMALL.severity).toBe("blocking");
    expect(byCode.PROBE_TOO_SMALL.text).toBe(
      "이 단어들로 만든 시험 퍼즐에는 4개만 들어갑니다. 5개 이상이 필요하니, 같은 글자가 들어간 단어를 더 추가해 보세요.",
    );
    expect(byCode.ISOLATED_WORDS.text).toBe(
      "다른 단어와 겹치는 글자가 없는 단어가 4개 있습니다: 선거, 대통령, 투표, 평등",
    );
    expect(byCode.ISOLATED_WORDS.entryIds).toEqual(r.isolatedIds);
    expect(byCode.SMALL_CONNECTED_GROUP.text).toBe(
      "서로 이어지는 단어가 가장 많은 묶음이 6개뿐입니다. 같은 글자가 들어간 단어를 더 추가해 보세요.",
    );
    expect(r.messages.some((m) => m.code === "READY")).toBe(false);
  });

  it("too few words is a blocking message with the count", () => {
    const r = computeReadiness(mk(["사과", "과일", "일기"], noLeak));
    expect(r.messages[0]).toMatchObject({
      code: "TOO_FEW_WORDS",
      severity: "blocking",
      text: "쓸 수 있는 단어가 3개뿐입니다. 서로 겹치는 단어가 5개 이상 필요합니다.",
    });
  });

  it("lists at most five words and says how many more", () => {
    const r = computeReadiness(mk(CIVICS));
    const leak = r.messages.find((m) => m.code === "CLUE_CONTAINS_ANSWER");
    expect(leak?.text).toContain("20개");
    expect(leak?.text).toContain("민주주의, 삼권분립, 헌법, 국민, 선거 외 15개");
    expect(leak?.entryIds).toHaveLength(20);
  });

  it("explains excluded words by reason", () => {
    const r = computeReadiness(mk([...CHAIN.slice(0, 8), "😀", "A B", "사과"], noLeak));
    const texts = r.messages.filter((m) => m.code === "EXCLUDED_WORDS").map((m) => m.text);
    expect(texts).toContain(
      "2개 단어는 정답으로 쓸 수 없습니다 (이모지·기호·공백 등). 글자와 숫자로만 된 정답으로 고쳐 주세요.",
    );
    expect(texts).toContain("1개 단어는 같은 정답이 이미 있어서 쓸 수 없습니다.");
  });

  it("every message has a severity and Korean text, and blocking messages appear only for blocked sets", () => {
    for (const words of [CHAIN, SCIENCE, CIVICS, ["사과"], CHAIN.slice(0, 6)]) {
      const r = computeReadiness(mk(words));
      for (const m of r.messages) {
        expect(["info", "warning", "blocking"]).toContain(m.severity);
        expect(m.text).toMatch(/[가-힣]/);
      }
      expect(r.messages.some((m) => m.severity === "blocking")).toBe(r.band === "blocked");
    }
  });
});

describe("purity", () => {
  it("imports nothing from Supabase, the audit log or the database layer", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/features/crossword/readiness.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/supabase|audit|server-only|next\//i);
  });
});
