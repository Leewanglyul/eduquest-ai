/**
 * Korean IME input controller: a PURE state machine (docs/m2/08-m2-2-4a-student-play-foundation-plan.md C.7).
 * No DOM. The thin client hook (F3) turns browser events into ImeEvent and applies the returned intents.
 *
 * It works on ONE word: n cells, a selected cell, which cells are locked (prefilled or revealed). One uncontrolled
 * <input> holds focus; the cells are visual. Rules, each proven by traces of real keyboards (tests/fixtures/ime):
 *
 *  R1 Syllable hand-off is one tick: compositionend and the next compositionstart can arrive together, with the
 *     committed syllable still in input.value. Commit from the event data, then accept the new composition.
 *  R2 Never write input.value or the selection while a composition is open. canResetInput() is false then; the hook
 *     calls it at the moment a deferred reset runs and skips the reset when it says no. Pending text is
 *     value.slice(committedLen), so no reset is needed between syllables.
 *  R3 Backspace inside a composition is a composition update, not a key: the IME shortens the data (산 -> 사 -> ㅅ)
 *     and an empty update followed by input deleteContent* is a cancel. No cell is touched.
 *  R5 Pending text is shown over consecutive unlocked cells from the anchor, clamped at the word end, and recomputed
 *     from the whole buffer on every update (syllables change retroactively). A long composition is NOT committed
 *     early: everything is committed when the composition ends (deviation from doc 07 C.7 point 4, which would risk
 *     committing a syllable the IME later changes).
 *  R6 Event order is not trusted. A pending composition is committed, once, by compositionend, blur, a cell
 *     selection, a paste or flush(), whichever comes first; the others then find nothing to commit.
 *  R7 While composing (isComposing, keyCode 229, key "Process") keys do nothing: no Backspace handling, no arrows.
 *  R8 A cell takes one NFC [가-힣A-Z0-9]. A lone jamo is rejected, lower-case is upper-cased, anything else rejected.
 */
import { isLoneJamo, isValidCellChar, normalizeTyped } from "../cells";

export type ImeEvent =
  | { type: "compositionstart" }
  | { type: "compositionupdate"; data: string }
  /** value = input.value at that moment (used only to track how much of it is already committed). */
  | { type: "compositionend"; data: string; value?: string }
  | { type: "input"; inputType: string; data: string | null; isComposing: boolean; value: string }
  /** valueEmpty = the proxy input holds no text (so a Backspace has nothing to delete in the input itself). */
  | { type: "keydown"; key: string; keyCode: number; isComposing: boolean; valueEmpty: boolean }
  | { type: "blur" }
  | { type: "paste"; text: string }
  /** The user picked another cell (tap or navigation). */
  | { type: "select"; index: number };

export type CellWrite = { index: number; char: string };

export type Intent =
  /** Show these characters as pending (not committed) in these cells. Empty = clear the preview. */
  | { kind: "preview"; cells: CellWrite[] }
  /** Write these finished characters into these cells. */
  | { kind: "commit"; writes: CellWrite[] }
  /** Empty this cell. */
  | { kind: "delete"; index: number }
  /** The selection moved. atEnd = the word's last cell was filled and there is no next cell. */
  | { kind: "select"; index: number; atEnd: boolean }
  | { kind: "reject"; char: string; reason: "jamo" | "invalid" }
  | { kind: "overflow" };

export type ImeWord = {
  /** Number of cells of the word. */
  length: number;
  /** Selected cell index, 0-based. */
  selected: number;
  /** Current contents, "" for empty. Length = word length. */
  cells: readonly string[];
  /** Locked cells (prefilled or revealed): typing skips them, Backspace leaves them. */
  locked?: readonly boolean[];
};

export class ImeController {
  private n = 0;
  private cells: string[] = [];
  private locked: boolean[] = [];
  private sel = 0;
  private composing = false;
  private anchor = 0;
  private buf = "";
  private committedLen = 0;
  /** Text of the last composition commit; absorbs the compositionend that follows a blur/select flush (R6). */
  private recent: string | null = null;

  constructor(word?: ImeWord) {
    if (word) this.setWord(word);
  }

  /** Point the controller at a word. A pending composition is dropped (the hook flushes first when it matters). */
  setWord(word: ImeWord): void {
    this.n = word.length;
    this.cells = Array.from({ length: word.length }, (_, i) => word.cells[i] ?? "");
    this.locked = Array.from({ length: word.length }, (_, i) => Boolean(word.locked?.[i]));
    this.sel = Math.max(0, Math.min(word.selected, Math.max(0, word.length - 1)));
    this.composing = false;
    this.buf = "";
    this.recent = null;
  }

  get state() {
    return {
      selected: this.sel,
      composing: this.composing,
      pending: this.buf,
      cells: [...this.cells],
    };
  }

  /** R2: may the hook write input.value right now? */
  canResetInput(): boolean {
    return !this.composing;
  }

  /** The hook has emptied input.value. */
  inputWasReset(): void {
    this.committedLen = 0;
  }

  /** Commit whatever is pending (save, submit, leaving the page). */
  flush(): Intent[] {
    return this.commitPending();
  }

  handle(e: ImeEvent): Intent[] {
    switch (e.type) {
      case "compositionstart":
        return this.onCompositionStart();
      case "compositionupdate":
        return this.onCompositionUpdate(e.data);
      case "compositionend":
        return this.onCompositionEnd(e.data, e.value);
      case "input":
        return this.onInput(e);
      case "keydown":
        return this.onKeydown(e);
      case "blur":
        return this.commitPending();
      case "paste":
        return this.onPaste(e.text);
      case "select":
        return this.onSelect(e.index);
    }
  }

  // ---------------------------------------------------------------------------------------------------------

  private onCompositionStart(): Intent[] {
    // A previous composition that never reported its end (seen after an IME cancel): commit it once.
    const out = this.composing ? this.commitPending() : [];
    this.recent = null;
    this.composing = true;
    this.anchor = this.sel;
    this.buf = "";
    return out;
  }

  private onCompositionUpdate(data: string): Intent[] {
    if (!this.composing) this.startImplicit();
    this.recent = null;
    this.buf = normalizeTyped(data);
    return [this.previewIntent()];
  }

  private onCompositionEnd(data: string, value?: string): Intent[] {
    if (!this.composing) {
      // Already committed by a blur/select/flush (or a repeated end): never commit it twice.
      if (this.recent !== null && (normalizeTyped(data) === this.recent || normalizeTyped(data) === "")) {
        this.recent = null;
        if (value !== undefined) this.committedLen = normalizeTyped(value).length;
        return [];
      }
      this.startImplicit();
    }
    const text = normalizeTyped(data) !== "" ? normalizeTyped(data) : this.buf;
    this.composing = false;
    this.buf = "";
    this.recent = text !== "" ? text : null;
    if (value !== undefined) this.committedLen = normalizeTyped(value).length;
    return [{ kind: "preview", cells: [] }, ...this.commitText(text, this.anchor)];
  }

  private onInput(e: Extract<ImeEvent, { type: "input" }>): Intent[] {
    // A composition input that trails a blur/select flush: the text is already committed.
    if (!this.composing && e.isComposing && this.recent !== null) return [];
    const deleting = e.inputType.startsWith("deleteContent");
    if (this.composing && deleting && this.buf === "") {
      // R3: the IME unwound its last jamo; the composition is over and nothing is committed.
      this.composing = false;
      this.committedLen = normalizeTyped(e.value).length;
      return [{ kind: "preview", cells: [] }];
    }
    this.recent = null;
    if (this.composing || e.isComposing) {
      if (!this.composing) this.startImplicit();
      this.buf =
        e.inputType === "insertCompositionText" && e.data !== null
          ? normalizeTyped(e.data)
          : normalizeTyped(e.value).slice(this.committedLen);
      return [this.previewIntent()];
    }
    if (deleting) return this.backspace();
    // Not composing: a keyboard that sends finished text (or never fires composition events).
    const text = normalizeTyped(e.value).slice(this.committedLen);
    return text ? this.commitText(text, this.sel) : [];
  }

  private onKeydown(e: Extract<ImeEvent, { type: "keydown" }>): Intent[] {
    if (this.composing || e.isComposing || e.keyCode === 229 || e.key === "Process") return []; // R7
    if (e.key === "Backspace" && e.valueEmpty) return this.backspace();
    if (e.key === "ArrowLeft") return this.moveTo(this.sel - 1, -1);
    if (e.key === "ArrowRight") return this.moveTo(this.sel + 1, 1);
    return [];
  }

  private onPaste(text: string): Intent[] {
    const out = this.commitPending();
    return [...out, ...this.commitText(text, this.sel)];
  }

  private onSelect(index: number): Intent[] {
    const out = this.commitPending(); // R6: never lose a pending syllable when the student taps elsewhere
    this.sel = Math.max(0, Math.min(index, this.n - 1));
    return [...out, { kind: "select", index: this.sel, atEnd: false }];
  }

  // ---------------------------------------------------------------------------------------------------------

  /** A composition event arrived without compositionstart (some Android keyboards). */
  private startImplicit(): void {
    this.composing = true;
    this.anchor = this.sel;
    this.buf = "";
  }

  /** Unlocked slots from the anchor to the end of the word. */
  private slotsFrom(start: number): number[] {
    const slots: number[] = [];
    for (let i = start; i < this.n; i++) if (!this.locked[i]) slots.push(i);
    return slots;
  }

  private previewIntent(): Intent {
    const slots = this.slotsFrom(this.anchor);
    const chars = Array.from(this.buf);
    return { kind: "preview", cells: chars.slice(0, slots.length).map((char, k) => ({ index: slots[k], char })) };
  }

  private commitPending(): Intent[] {
    if (!this.composing) return [];
    const text = this.buf;
    this.composing = false;
    this.buf = "";
    this.recent = text !== "" ? text : null;
    return [{ kind: "preview", cells: [] }, ...this.commitText(text, this.anchor)];
  }

  /** Writes valid characters into consecutive unlocked cells from `start`; rejects the rest. */
  private commitText(raw: string, start: number): Intent[] {
    const intents: Intent[] = [];
    const writes: CellWrite[] = [];
    let i = start;
    let overflow = false;
    for (const ch of Array.from(normalizeTyped(raw))) {
      if (!isValidCellChar(ch)) {
        intents.push({ kind: "reject", char: ch, reason: isLoneJamo(ch) ? "jamo" : "invalid" });
        continue;
      }
      while (i < this.n && this.locked[i]) i++;
      if (i >= this.n) {
        overflow = true;
        break;
      }
      this.cells[i] = ch;
      writes.push({ index: i, char: ch });
      i++;
    }
    if (writes.length > 0) {
      while (i < this.n && this.locked[i]) i++;
      this.sel = Math.min(i, this.n - 1);
      intents.push({ kind: "commit", writes }, { kind: "select", index: this.sel, atEnd: i >= this.n });
    }
    if (overflow) intents.push({ kind: "overflow" });
    return intents;
  }

  /** Backspace outside a composition: empty the selected cell, or step back to the previous unlocked cell. */
  private backspace(): Intent[] {
    if (!this.locked[this.sel] && this.cells[this.sel]) {
      this.cells[this.sel] = "";
      return [{ kind: "delete", index: this.sel }];
    }
    for (let i = this.sel - 1; i >= 0; i--) {
      if (this.locked[i]) continue;
      this.sel = i;
      const out: Intent[] = [{ kind: "select", index: i, atEnd: false }];
      if (this.cells[i]) {
        this.cells[i] = "";
        out.push({ kind: "delete", index: i });
      }
      return out;
    }
    return [];
  }

  private moveTo(index: number, step: 1 | -1): Intent[] {
    let i = index;
    while (i >= 0 && i < this.n && this.locked[i]) i += step;
    if (i < 0 || i >= this.n) return [];
    this.sel = i;
    return [{ kind: "select", index: i, atEnd: false }];
  }
}
