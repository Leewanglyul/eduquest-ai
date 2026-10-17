import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  COMMIT_TOKEN_TTL_MINUTES,
  DEFINITION_MAX_CHARS,
  MAX_CONTENT_CSV_BYTES,
  MAX_CONTENT_ROWS,
  MAX_SET_ENTRIES,
  TERM_MAX_CHARS,
} from "./content-schemas";

/** The numbers the import pages show, taken from the same constants the checks use. Passed to the form as props. */
export const CONTENT_IMPORT_LIMITS = {
  maxRows: MAX_CONTENT_ROWS,
  maxCsvBytes: MAX_CONTENT_CSV_BYTES,
  maxSetEntries: MAX_SET_ENTRIES,
  maxTermChars: TERM_MAX_CHARS,
  maxDefinitionChars: DEFINITION_MAX_CHARS,
  answerMinLen: ANSWER_MIN_LEN,
  answerMaxLen: ANSWER_MAX_LEN,
  tokenMinutes: COMMIT_TOKEN_TTL_MINUTES,
} as const;

export const CONTENT_SAMPLE_HREF = "/samples/content-sample.csv";
