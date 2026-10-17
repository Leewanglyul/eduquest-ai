/**
 * A single-entry edit that breaks the content rules. `messages` are the Korean row messages of
 * docs/m2/01-csv-content-pipeline.md §4.8 (the same ones the importer shows), one per broken rule.
 */
export class ContentEntryError extends Error {
  messages: string[];

  constructor(messages: string[]) {
    super(messages[0] ?? "단어를 저장할 수 없습니다.");
    this.name = "ContentEntryError";
    this.messages = messages;
  }
}
