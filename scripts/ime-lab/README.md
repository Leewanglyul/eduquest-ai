# IME lab v2 (M2-2.4a F0)

Throwaway test page for Korean input in crossword cells. It is **not app code**: no `src/` file, no migration, no dependency. Purpose and criteria: `docs/m2/07-m2-2-4-student-play-plan.md` (C.7, E.12, H).

## Run

```bash
node scripts/ime-lab/serve.mjs
```

It prints one URL per network interface. Open the `http://<ip>:4177/` URL on the phone or tablet (same Wi-Fi; allow Node through the Windows firewall for private networks when asked). On the Windows machine itself use `http://localhost:4177/`.

## Devices (PM, 2026-10-17)

| Device | Browsers |
|---|---|
| Galaxy S24 | Samsung Internet, Chrome |
| Galaxy Tab S9 | Samsung Internet, Chrome |
| Windows 11 | Chrome, Edge |

**Priority changed by the PM on 2026-10-18** (real deployment order): 1 Galaxy Tab S9 + Samsung Internet, 2 Galaxy Tab S9 + Chrome, 3 Windows Chrome, 4 Windows Edge, 5 Galaxy S24 (useful, no longer a deployment target). Run the lab in that order.

Run every case for each device/browser in **portrait and landscape** (phones and tablet), with the **soft keyboard** and, where possible, a **hardware keyboard** (the tablet and Windows). Type the device and browser in the first field (for example `S24 / Samsung Internet`) before saving.

## How a run works

1. Pick **input method**: **A** one input over the grid (recommended design), **B** one input per cell, **C** whole-word field. Run A first; B and C are comparisons. For A also repeat with the **U+200B** option on (it lets some Android keyboards report Backspace on an empty field).
2. Press a case button (c1 to c10) and follow the steps shown. Press **시험 끝** to get the automatic judgement, add a note, then **통과/실패로 기록**.
3. When the device is done, fill in **기기 전체 의견** (is it usable on this browser, SC6) and press **서버에 저장**. If the server cannot be reached, a JSON file is downloaded instead; put it in `scripts/ime-lab/traces/`.
4. `node scripts/ime-lab/summarize.mjs` prints the case-by-device matrix and the failed checks.

## Cases and success criteria

| Case | Tests |
|---|---|
| c1 one-cell input | single cell, `가` |
| c2 syllable completion | `사과` |
| c3 batchim hand-over | `아나` (`안`+`ㅏ`) |
| c4 double final, several syllables | `닭고기` |
| c5 fast typing | `대한민국` as fast as possible |
| c6 Backspace during composition | `산` ⌫ ⌫ `ㅏ` |
| c7 Backspace after commit | `사과` ⌫⌫ `나` |
| c8 focus move after commit | selection ends on the 3rd cell |
| c9 paste | `사과나무` into 3 cells gives `사과나` |
| c10 Latin and digit cells | `a`, `1` gives `A1` |

Success criteria (PM): **SC1** no duplicated characters · **SC2** no dropped characters · **SC3** no premature focus change during composition · **SC4** Backspace correct during active composition (c6) · **SC5** each Korean syllable commits exactly once · **SC6** input stays usable on Samsung Internet. The page checks SC1 to SC5 automatically per case; SC4 and SC6 also need the tester's judgement. A run with a clean automatic result and a tester "fail" (or the reverse) is shown as `ok*` or `FAIL` in the summary.

## What it records

For every case: all `compositionstart/update/end`, `beforeinput`, `input` (with `inputType`), `keydown/keyup` (with `key`, `keyCode`, `isComposing`), `focus/blur`, paste, plus the commit decisions. These traces become the fixtures for the pure input controller tests in M2-2.4c.

## Decision it feeds

H.1: input method A (one proxy input), B (per-cell), or C (word entry as primary). If A fails on **Samsung Internet**, 2.4e builds word entry as the primary input and the grid becomes display plus selection.

## Limits of this spike

Only the devices above. No Safari/iPadOS, no ChromeOS, no Microsoft IME on other browsers; add them later if needed. Pending text is shown by the page itself, so what the soft keyboard draws on its own (suggestion strip) is only noted in the tester comment.

## v2 changes (2026-10-17, after the first Windows traces)

Why: the v1 lab reset the proxy value one tick after `compositionend`. On Windows the next syllable's `compositionstart` arrives in the same tick, so the reset destroyed the new composition (Edge c3 `아나`, Chrome c8). See `docs/m2/08-m2-2-4a-student-play-foundation-plan.md` section 0.3 and rules R1 to R3.

- **R2** The proxy value is never written while a composition is open. Pending text is `value.slice(committedLen)`; a reset that finds `composing` true is skipped (`reset-skipped` in the log).
- **R1** `compositionend` commits from `event.data` (or the tracked buffer), not from the whole value.
- **R3** An empty update plus `input` `deleteContent*` while composing is a composition cancel (`composition-cancel`). A `compositionstart` while still composing logs `missing-compositionend`.
- **c6** is judged objectively: the pending text seen on screen must run `ㅅ → 사 → 산 → 사 → ㅅ → 사`. Press Backspace exactly twice.
- **c7** no longer expects the last syllable to be committed: on Microsoft IME it is still composing, so Backspace unwinds jamo. Press until both cells are empty.
- **c3, c4, c5, c6, c8** end with Space (or →) to end the composition. The real board must also commit on blur, cell tap, save and submit (R6).
- Pressing 시험 끝 mid-composition no longer counts as a focus loss; the pending text is flushed (`flush-on-finish`).
- New fields: keyboard app and prediction strip; saved files carry `labVersion: 2`. `summarize.mjs` tags rows `[v1]` or `[v2]`; v1 files stay in `traces/` as regression data and are not a verdict on method A.
