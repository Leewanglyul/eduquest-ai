import { describe, expect, it } from "vitest";

import {
  CrosswordError,
  crosswordErrorMessage,
  mapDatabaseErrorCode,
  type CrosswordErrorCode,
} from "@/features/crossword/messages";
import {
  generateOptionsSchema,
  publishSchema,
  saveDraftSchema,
  updateDraftSchema,
} from "@/features/crossword/review/schemas";

const U = "00000000-0000-4000-8000-0000000000a1";

describe("crossword database error mapping", () => {
  it("maps the codes the database functions raise", () => {
    const direct = [
      "FORBIDDEN",
      "NOT_FOUND",
      "NOT_DRAFT",
      "NOT_PUBLISHED",
      "PUBLISHED_IMMUTABLE",
      "VERSION_EXISTS",
      "VERSION_SOURCE_INVALID",
      "RESTORE_NOT_ALLOWED",
      "RESAVE_NOT_ALLOWED",
      "ALREADY_ARCHIVED",
      "NOT_ARCHIVED",
      "ALREADY_ASSIGNED",
      "ASSIGNMENT_NOT_OPEN",
      "WINDOW_INVALID",
      "TOO_FEW_WORDS",
      "WORD_COUNT",
      "TICKET_INVALID",
      "TITLE_INVALID",
      "CLUE_INVALID",
      "WORD_NOT_FOUND",
      "CLASSROOM_INVALID",
      "CLASSROOM_ARCHIVED",
      "SET_NOT_FOUND",
      "SET_ARCHIVED",
    ];
    for (const code of direct) expect(mapDatabaseErrorCode(`CROSSWORD_${code}`)).toBe(code);
  });

  it("a placement hash mismatch means the set changed; every validator code means an invalid grid", () => {
    expect(mapDatabaseErrorCode("CROSSWORD_HASH_MISMATCH")).toBe("SET_CHANGED");
    for (const code of [
      "EMPTY",
      "BAD_WORD",
      "DUPLICATE",
      "OUT_OF_BOUNDS",
      "LETTER_CONFLICT",
      "UNINTENDED_RUN",
      "MISSING_RUN",
      "SINGLE_INVALID",
      "DISCONNECTED",
      "NOT_TRIMMED",
      "BAD_NUMBERING",
    ]) {
      expect(mapDatabaseErrorCode(`CROSSWORD_${code}`)).toBe("INVALID_GRID");
    }
  });

  it("ignores errors that are not ours", () => {
    expect(mapDatabaseErrorCode("duplicate key value violates unique constraint")).toBeNull();
    expect(mapDatabaseErrorCode("CROSSWORD_SOMETHING_NEW")).toBeNull();
    expect(mapDatabaseErrorCode(undefined)).toBeNull();
  });

  it("every code has a Korean message", () => {
    const codes: CrosswordErrorCode[] = [
      "INVALID_INPUT",
      "FORBIDDEN",
      "NOT_FOUND",
      "SET_CHANGED",
      "NOT_ENOUGH_WORDS",
      "PUBLISHED_IMMUTABLE",
      "PERSIST_FAILED",
    ];
    for (const code of codes) expect(crosswordErrorMessage(code)).toMatch(/[가-힣]/);
    expect(new CrosswordError("NOT_ENOUGH_WORDS", { placed: 3 }).message).toContain("3개뿐");
    expect(crosswordErrorMessage("SET_CHANGED")).toBe(
      "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요.",
    );
  });
});

describe("crossword input schemas", () => {
  it("generate accepts the documented options and rejects the rest", () => {
    expect(generateOptionsSchema.safeParse({ setId: U, level: "easy" }).success).toBe(true);
    expect(
      generateOptionsSchema.safeParse({
        setId: U,
        level: "easy",
        seed: 0xffffffff,
        gridSize: 15,
        scripts: ["hangul"],
      }).success,
    ).toBe(true);
    for (const bad of [
      { setId: "x", level: "easy" },
      { setId: U, level: "extreme" },
      { setId: U, level: "easy", seed: -1 },
      { setId: U, level: "easy", gridSize: 4 },
      { setId: U, level: "easy", gridSize: 16 },
      { setId: U, level: "easy", scripts: [] },
      { setId: U, level: "easy", scripts: ["emoji"] },
    ]) {
      expect(generateOptionsSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("save needs the seed, the ticket and a trimmed title of 1-80 characters", () => {
    const base = { setId: U, level: "normal", seed: 5, ticketId: U, ticketToken: "t".repeat(43) };
    expect(saveDraftSchema.parse({ ...base, title: "  퍼즐  " }).title).toBe("퍼즐");
    expect(saveDraftSchema.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ ...base, title: "가".repeat(81) }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ setId: U, level: "normal", title: "x" }).success).toBe(
      false,
    );
  });

  it("update needs something to update and keeps clues to 1-200 characters", () => {
    expect(updateDraftSchema.safeParse({ puzzleId: U }).success).toBe(false);
    expect(updateDraftSchema.safeParse({ puzzleId: U, clues: [] }).success).toBe(false);
    expect(updateDraftSchema.safeParse({ puzzleId: U, title: "x" }).success).toBe(true);
    expect(
      updateDraftSchema.safeParse({
        puzzleId: U,
        clues: [{ number: 1, direction: "across", clue: "가".repeat(201) }],
      }).success,
    ).toBe(false);
  });

  it("publish needs at least one classroom and ISO dates", () => {
    expect(publishSchema.safeParse({ puzzleId: U, classroomIds: [U] }).success).toBe(true);
    expect(publishSchema.safeParse({ puzzleId: U, classroomIds: [] }).success).toBe(false);
    expect(
      publishSchema.safeParse({
        puzzleId: U,
        classroomIds: [U],
        opensAt: "2026-10-20T09:00:00+09:00",
        closesAt: null,
      }).success,
    ).toBe(true);
    expect(
      publishSchema.safeParse({ puzzleId: U, classroomIds: [U], opensAt: "tomorrow" }).success,
    ).toBe(false);
  });
});
