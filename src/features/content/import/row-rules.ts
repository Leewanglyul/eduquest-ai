import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  DEFINITION_MAX_CHARS,
  TERM_MAX_CHARS,
  type ContentRowError,
  type ContentRowWarningCode,
  type PreparedContentRow,
  type RawContentRow,
} from "./content-schemas";
import { charLength, cleanText, deriveAnswer, squash } from "./normalize";

export type RowEvaluation =
  | { ok: true; row: PreparedContentRow }
  | { ok: false; line: number; term: string; errors: ContentRowError[] };

const FORMULA_START = /^[=+\-@]/;

/**
 * Applies every per-row rule (docs/m2/01-csv-content-pipeline.md §4.1) to one raw row and returns
 * either the prepared row (with warnings) or all errors found. Duplicate rules need the other rows
 * and live in preview.ts.
 */
export function evaluateRow(raw: RawContentRow): RowEvaluation {
  const rawTerm = raw.term.trim();

  if (raw.tooFewColumns) {
    return { ok: false, line: raw.line, term: rawTerm, errors: [{ code: "ROW_TOO_FEW_COLUMNS" }] };
  }

  const term = cleanText(raw.term);
  const definition = cleanText(raw.definition);
  const errors: ContentRowError[] = [];
  const warnings: ContentRowWarningCode[] = [];

  if (term.controlRemoved || definition.controlRemoved) warnings.push("CONTROL_CHARS_REMOVED");
  if (term.whitespaceChanged || definition.whitespaceChanged) warnings.push("WHITESPACE_NORMALISED");

  if (term.text === "") errors.push({ code: "TERM_EMPTY" });
  else if (charLength(term.text) > TERM_MAX_CHARS) errors.push({ code: "TERM_TOO_LONG" });

  if (definition.text === "") errors.push({ code: "DEFINITION_EMPTY" });
  else if (charLength(definition.text) > DEFINITION_MAX_CHARS) errors.push({ code: "DEFINITION_TOO_LONG" });

  let derived: Extract<ReturnType<typeof deriveAnswer>, { ok: true }> | null = null;
  if (term.text !== "") {
    const result = deriveAnswer(term.text);
    if (!result.ok) {
      errors.push(
        result.code === "ANSWER_JAMO"
          ? { code: "ANSWER_JAMO" }
          : { code: "ANSWER_INVALID_CHAR", context: { chars: result.chars } },
      );
    } else if (result.length < ANSWER_MIN_LEN) {
      errors.push({ code: "ANSWER_TOO_SHORT" });
    } else if (result.length > ANSWER_MAX_LEN) {
      errors.push({ code: "ANSWER_TOO_LONG", context: { length: result.length } });
    } else {
      derived = result;
    }
  }

  if (errors.length > 0 || derived === null) {
    return { ok: false, line: raw.line, term: rawTerm, errors };
  }

  if (derived.script === "mixed") warnings.push("ANSWER_MIXED_SCRIPT");
  if (squash(definition.text).includes(derived.answer)) warnings.push("DEFINITION_CONTAINS_ANSWER");
  if (/^[\t\r]/.test(raw.definition) || FORMULA_START.test(definition.text)) warnings.push("FORMULA_PREFIX");

  return {
    ok: true,
    row: {
      line: raw.line,
      term: term.text,
      definition: definition.text,
      answer: derived.answer,
      answerLength: derived.length,
      script: derived.script,
      warnings,
    },
  };
}
