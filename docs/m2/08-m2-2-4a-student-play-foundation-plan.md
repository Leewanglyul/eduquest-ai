# M2-2.4a Student Play Foundation: implementation plan

Status: **plan only. Nothing is implemented, no migration is cut, no file under `src/` is touched.** Written 2026-10-17 for PM review. Baseline: `0e781cf` (Teacher Review complete). Sources read: [04](04-crossword-generator.md) §5, §6, §9, §10 · [05](05-m2-2-2-teacher-review-plan.md) §13 · [06](06-m2-3-competition-framework.md) §11.8, §12.8, §12.9 · [product note 01](../product/01-student-learning-profile.md) · [07](07-m2-2-4-student-play-plan.md) (the full M2-2.4 plan) · the migrations, services, middleware and student guard as they are in the repository · the three IME lab traces in `scripts/ime-lab/traces/`.

Scope: **one student solving one crossword alone.** Not planned and not prepared beyond keeping the shape open: team play, shared attempts, competition, leaderboards, badges, collaboration, help requests, focus tracking.

Approved order, which every screen and message in this plan follows:

```
Progress -> Growth -> Achievements -> Collaboration -> Competition
```

This phase serves the first two and leaves a slot for the third. It contains no ranking, no comparison with another student, no score and no timer.

---

## 0. How this plan relates to doc 07, and what the review changed

**Doc 07 is already a complete M2-2.4 plan** (schema, services, screens, security, tests, PM decisions E.1–E.14). This document does not replace it. It (1) cuts the work into a **Foundation** that can be built and verified before any polish, (2) answers the 14 design items in the order requested, (3) folds in the **first real IME evidence**, which doc 07 did not have, and (4) records five corrections to doc 07 found on this read.

### 0.1 Naming clash resolved

Doc 07 H calls its first step "2.4a IME spike". The request calls the phase "M2-2.4a Student Play Foundation". To keep one numbering:

| This plan | Contains | Doc 07 steps it replaces |
|---|---|---|
| **2.4a Foundation** = F0–F3 | F0 IME validation · F1 schema · F2 play core (pure code) · F3 service, handlers, security tests, and a **bare play board** (no styling) used to re-validate IME in the real component | 07-a, 07-b, 07-c, 07-d |
| 2.4b Screens | list, play polish, result, completion moment, `/student` block, accessibility and mobile layout | 07-e |
| 2.4c Hardening | device matrix on the real build, axe, budgets, security review, governance text | 07-f |

The IME spike is **F0**, not the whole of 2.4a. Doc 07's README row and H table should be read through this mapping; no section of doc 07 is deleted.

### 0.2 Corrections to doc 07 (all small, all found by reading it against the code and the traces)

| # | Doc 07 says | Problem | Correction in this plan |
|---|---|---|---|
| 1 | C.4: reveal "refuses locked or already-correct cells" | A refusal of the form "this cell is already correct" is a **free correctness check**. On `normal` (word-scope check only) it lets a student probe single cells at no cost, and on `hard` it makes the "no check" mode leaky | A reveal refuses only **locked** cells (prefill or earlier reveal), which the client already knows. On any other cell it spends one reveal and returns the letter, even when the student's letter was already right. The UI warns before spending ("이 칸의 글자를 알려 줄까요? 남은 횟수 n번") |
| 2 | C.4/C.5: a check works on "saved server state" | Nothing orders a check after the student's last keystroke. Autosave is debounced by 2 s, so a check can run against stale cells and report a cell as `empty` that the student just typed | Check and submit carry **`baseRevision`**. The client flushes its patch first and sends the revision the save returned. The server answers `STALE` if `revision` moved on (a second device). Same field later serves team attempts |
| 3 | C.1: autosave uses `fetch(..., { keepalive: true })` | `keepalive` bodies are capped (about 64 kB total in flight) and the patch must stay small; fine, but it is not stated | Patch cap `PLAY_MAX_PATCH_CELLS` stays 225 (≤ about 4 kB). Stated here as a constraint, pinned by a test |
| 4 | A.2: start is "idempotent, ON CONFLICT" | Two inserts (attempt, then member) cannot be made idempotent by `ON CONFLICT` on one table; a race can leave an orphan attempt | `fn_crossword_play_start` takes `pg_advisory_xact_lock(hashtextextended(assignment_id::text \|\| student_id::text, 0))` first, then looks up the member row, then inserts. A pgTAP case runs it twice in one transaction and asserts one attempt |
| 5 | C.7: IME controller design points are stated as design | The first traces show a point doc 07 does not have (§C.7 rules R1–R3): on Windows the browser fires `compositionend` and the next `compositionstart` **in the same millisecond**, and a deferred reset of the input value destroys the new composition | Folded into the IME model (§C.7) and into the F0 re-run (§G) |

### 0.3 What the IME traces show (and do not show)

Three trace files exist, all from 2026-10-17, all input method A (one proxy input), **hardware keyboard, landscape, Windows 11**: one Chrome run and two Edge runs (`node scripts/ime-lab/summarize.mjs`).

| Case | Chrome | Edge (last run) |
|---|---|---|
| c1 one cell, c2 syllables, c9 paste | pass | c1 flagged SC5; c2 pass; c9 pass |
| c3 batchim hand-over `아나` | pass | **fail** (tester: "shows 아아, becomes 아나 after space") |
| c4 `닭고기` | pass | **fail** (last syllable shown wrong until focus leaves) |
| c5 fast typing | pass | **fail** (tester: cannot keep up) |
| c6 Backspace during composition | tester pass, auto fail | tester pass, auto fail |
| c7 Backspace after commit | tester pass, auto fail | fail |
| c8 focus after commit | fail (`가` instead of `가나`, focus lost) | fail (`가가나`) |
| c10 Latin/digit | not run | tester fail, automatic result correct |

What the raw events say (Edge c3, 2026-10-17T10:37; Chrome c8 shows the same):

```
t=2032  compositionupdate "아"   compositionend "아"   commit "아" -> cell 0
t=2032  compositionstart         compositionupdate "나"   input value "아나"
t=2034  idle-reset  (lab writes proxy.value = "" one tick after compositionend)
...     later: composing stays true, a new compositionstart arrives with composing already true,
        blur reported as FOCUS_LOST_DURING_COMPOSITION (Chrome c8, t=8470)
```

Reading: the Microsoft Korean IME hands a syllable over by ending one composition and starting the next in the same tick, with the committed syllable still inside the input's value. The lab's `idleReset` (a `setTimeout(0)` after `compositionend`) then wipes the value **while the new composition is open**. That is a defect of the lab, not a verdict on method A. The failures in c3, c4, c5, c8 all follow this pattern. The c6/c7 auto-judge disagrees with the tester because the IME unwinds jamo inside one composition (`산` → `사` → `ㅅ` → empty, then `compositionend` with empty data and `input` `deleteContentBackward`), which the judge's expectation does not model.

**Not shown:** anything on Galaxy S24, Galaxy Tab S9, Samsung Internet, Gboard or the Samsung keyboard; any portrait run; any soft-keyboard run; any result for input methods B and C. **SC6 (usable on Samsung Internet) has no evidence at all.** No pass or fail is claimed for any target device.

Consequence: the lab needs a **v2** (do not touch the value during a composition; fix the judge for c6/c7) before the device sessions are worth running. This is F0 in §H and requirement G.2.

### 0.4 F0 progress: lab v2 on Windows 11 / Edge (2026-10-17)

Trace: `traces/2026-10-17T14-56-41-769Z_Windows_11_Edge.json` (`labVersion: 2`). Input method A (proxy), hardware keyboard, landscape 1490x740, Microsoft Korean IME, U+200B off. Eleven recorded runs; the tester's verdict is **pass on every run**, no blocking issue observed.

**Teacher evaluation (PM, 2026-10-17): all scenarios usable, no blocking issue. Recorded as Usability PASS for Windows 11 / Edge.**

| | v1 (same browser) | v2 |
|---|---|---|
| c3 `아나`, c4 `닭고기`, c5 fast typing, c8 focus after commit | fail (c3, c4, c5, c8) | pass, automatic checks clean for c3, c5, c8 |
| c7 Backspace after commit | fail | pass (second attempt clean) |
| c10 Latin/digit | tester fail | pass |
| focus lost during composition | 2 to 3 per run | 0 in every run |

This supports the §0.3 reading: the v1 failures came from the lab's deferred reset, not from method A. The raw v2 log shows the hand-off working as R1/R2 intend (`compositionend 닭` → commit → `compositionstart ㄱ` → `reset-skipped` while composing).

**Caveats, stated so the result is not read as more than it is:**

- Automatic checks are not clean on three recordings: c4, c6 (twice) and the first c7. These are recording artifacts, not input faults. In c4 the log itself shows `닭`, `고`, `기` each committed once by `compositionend`; the tester then kept typing in the same case before recording, so the final cells were empty. c6 shows the required pending sequence `ㅅ 사 산 사 ㅅ` but no run ends with the final `ㅏ` → `사` and a clean automatic pass. The tester's verdict covers them; if a clean automatic row is wanted, c4 and c6 should be re-recorded once, one pass each.
- Scope is one browser: **Edge on Windows, hardware keyboard, landscape, method A, no sentinel**. Windows Chrome has no v2 run yet. Nothing was run on a touch device.
- **SC6 (usable on Samsung Internet) still has no evidence. It is the deciding gate for G.4.**

**PM priority for the rest of F0:** Galaxy S24 / Samsung Internet is the final mobile confirmation. The matrix of G.1 is unchanged (Tab S9, Chrome on Android and Windows Chrome remain listed); the PM may narrow it. Until Samsung Internet is run, the decision stays "method A, word entry as second path" (G.4 first row is not yet reached) and F2/F3 proceed on that assumption with the fallback kept open.

---

## A. Student workflow

```
sign in (existing) -> /student -> [풀 수 있는 퍼즐 n개] -> /student/crosswords
   list card (새 퍼즐 | 이어하기 | 완료 | 마감) -> /student/crosswords/[assignmentId]
        start-or-resume -> type (autosave) -> use tools -> 제출
             -> not all filled: "아직 빈 칸이 n개 있어요"
             -> wrong:        supportive message (count by mode), cooldown by mode
             -> all correct:  completion moment -> /student/crosswords/[assignmentId]/result
                                  -> 다음 퍼즐 | 다른 퍼즐 보기 | 학생 홈
```

| Step | Rule | Item |
|---|---|---|
| 1 List | Visible when: active enrollment, classroom not archived, assignment `open` and inside `opens_at`/`closes_at` (null = open-ended), puzzle `published`. One server function decides it for the list and for every later request | 1, 2 |
| 2 Open | Route key is the **assignment id**. Student id comes from the session only. Anything not visible (not enrolled, other school, malformed id, nonexistent) gives the same "찾을 수 없습니다" page | 2 |
| 3 Start or resume | First open creates the attempt and its member row, freezes the pre-filled cell keys, returns the payload. Second tab or device converges on the same attempt | 7 |
| 4 Play | Select cell and word, type, move, switch direction. Everything is autosaved as a patch. Tools offered are only those the puzzle settings allow | 3–6 |
| 5 Tools | 초성, reveal one letter, check (scope by preset). Wording is "도구를 활용했어요", never a penalty | 6 |
| 6 Submit | Only an explicit 제출 can complete. The button is enabled when every cell is filled (the client knows only that) | 8 |
| 7 Complete | Server decides. The response says `completed` once; the client plays the completion moment once | 9 |
| 8 Result | The student's own finished grid, words, active minutes, tool summary, next step. No score, rank or comparison | 10 |
| 9 Closed/archived | Read-only, cells visible, no correctness marks, "수업에서 닫힌 퍼즐입니다". Saves accepted for a 120 s grace after `closes_at`; checks, reveals, submit are not | 7 |

Edge flows (supersede, removal, transfer, second device, network down) are as doc 07 A.6 and are not repeated. Cells are **never** copied to `localStorage`; school devices are shared.

---

## B. Database impact

All additive. No existing table, policy or function changes. The migration set ends at `20261018000003`; new ones are `20261019000001`–`3`.

| Migration | Contents | Note |
|---|---|---|
| `…000001_crossword_play_enums.sql` | `crossword_attempt_status` (`in_progress`, `completed`), `crossword_attempt_event_kind` (`check`, `reveal`, `chosung`, `submit_wrong`, `completed`) | enums only, as in the earlier phases |
| `…000002_crossword_attempts.sql` | `crossword_attempts`, `crossword_attempt_members`, `crossword_attempt_events`; indexes; `updated_at` trigger; erasure trigger; RLS **enabled, no policy** on all three | |
| `…000003_fn_crossword_play.sql` | the `fn_crossword_play_*` functions; `REVOKE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role` on every one | Postgres grants `EXECUTE` to `PUBLIC` by default, so the revoke is mandatory, as in migration 24 |

Table shape is doc 07 B.2 unchanged. The points that matter for this phase:

- **The attempt has no student column.** Owners are rows in `crossword_attempt_members`; today exactly one. `unique (assignment_id, student_id)` on the member table makes "one attempt per student and assignment" true for individual play and for any later mode where a student sits in one shared grid per assignment.
- `cells jsonb` is `{"r,c": "사"}`: typed cells only, no identity. `prefill_keys` and `revealed_keys` hold keys, never letters.
- Counters (`checks_used`, `reveals_used`, `chosung_used`, `submits_used`, `active_seconds`), `revision`, `started_at`, `updated_at`, `completed_at` live on the attempt. Nothing derived (score, rank, percentage) is stored.
- `crossword_attempt_events` (accepted, E.6): `kind`, `actor_student_id` (nullable, `SET NULL`), and `detail` limited by a CHECK to `{scope, words:[{number, direction}]}`, at most two word references. No letter, answer or cell text can be stored; a pgTAP case tries and must fail.
- Erasure: deleting a student cascades to the member row; an `AFTER DELETE` trigger deletes the attempt when no member remains. Retention follows `docs/pilot/12` (30 days after the pilot).
- **Not added:** play mode, team table, per-cell author, selection/focus/presence fields, help requests, leaderboard or score columns, any student-readable view. `play_mode` arrives with M2-3 as a defaulted column on the assignment.

Functions (service role only, `SECURITY INVOKER`, `search_path` pinned, stable `P0001` codes): `fn_crossword_play_access`, `_list`, `_start`, `_save`, `_check`, `_reveal`, `_chosung`, `_submit`, `_given`, `fn_crossword_attempt_limits`. Signatures as doc 07 B.4 with these changes from §0.2: `_start` takes the advisory lock; `_check` and `_submit` take `p_base_revision`; `_reveal` has no "already correct" refusal.

The two existing tests that pin "no attempts table yet" (`00012_…test.sql:79`, `crossword-hardening.test.ts:90`) are replaced in the **same commit** as migration `…000002`. The pin at `crossword-hardening.test.ts:75` (teacher code never touches attempts) stays and must stay green.

Governance (go-live gate, E.1): attempt state, hint counters, active seconds, word-reference events. The phase delivers draft text for `docs/pilot/12` and `13`; the PM and the school contact approve; nothing is signed here. Building and local testing proceed in the meantime; **no real student plays before the gate**.

---

## C. Service design

New code under `src/features/crossword/play/`, pages under `src/app/student/crosswords/**`. Nothing in `review/`, `access.ts`, `messages.ts` or `src/components/teacher/` changes.

### C.1 Files by phase

| Phase | Files |
|---|---|
| F2 (pure) | `constants.ts` · `types.ts` (no answer field exists in any type) · `messages.ts` (own catalogue) · `chosung.ts` · `cells.ts` · `prefill.ts` · `ime/controller.ts` |
| F3 (server) | `access.ts` · `payload.ts` · `service.ts` · `api-guard.ts` · route handlers `src/app/student/crosswords/[assignmentId]/api/{state,save,check,reveal,chosung,submit}/route.ts` · `ime/use-grid-input.ts` · a bare board component |
| 2.4b | list, play, result pages and components (§D) |

Handlers live under `/student/…` so `middleware.ts` (matcher `/student/:path*`) keeps refreshing the session during a long play; otherwise autosave would fail after the one-hour access token. No change to `middleware.ts`.

### C.2 Assignment access (items 1, 2)

`fn_crossword_play_access(student_id, assignment_id)` is the single implementation of the rule in §A. List, start, save, check, reveal, chosung and submit all call it first. A test enumerates the matrix: enrolled, removed, other classroom, other school, archived classroom, closed, not yet open, past `closes_at`, archived puzzle, draft puzzle. There is no `studentId` parameter in any handler, form or URL.

### C.3 What the browser receives

```
PlayPayload v1 = {
  v: 1, assignmentId, attempt: { status, revision },
  puzzle: { title, rows, cols, words: [{ number, direction, row, col, length, clue, single }] },  // NO answer
  given: { "r,c": "사", … },   // prefill + revealed letters only
  cells: { "r,c": "사", … },   // the student's own typed cells
  limits: { checkMode, revealsAllowed, revealsRemaining, chosungAllowed },
  readonly, closesAt
}
```

Built **field by field** by `payload.ts`; never a spread of a database row. Progress shown to the student is **filled** cells, never correct cells (a correct count would be a free check). The version field `v` lets a later payload add nicknames without breaking old clients.

### C.4 API contract (all JSON, `no-store`, same-origin, `Content-Type: application/json`)

| Endpoint | Request keys (exactly) | Reply | Refusals |
|---|---|---|---|
| `state` GET | none | `PlayPayload` | not found |
| `save` POST | `patch` `{key: char|null}`, `activeMs` (no `baseRevision`: merge patches need none) | `{revision, filled}` | locked cell, bad key or char, oversize, closed beyond grace |
| `check` POST | `scope` cell|word|puzzle, `keys`, `baseRevision` | `{results: [{key, status: ok|wrong|empty}], checksUsed, checksRemaining}` (null = unlimited) | scope not allowed, `CHECK_LIMIT`, rate window, `STALE` |
| `reveal` POST | `key`, `baseRevision` | `{key, char, revealsRemaining, revision}` | `REVEAL_NOT_ALLOWED`, `REVEAL_LIMIT`, locked cell, `STALE` |
| `chosung` POST | `number`, `direction` | `{chosung}` | not allowed, mixed answer |
| `submit` POST | `baseRevision` | `{result: completed}` or `{result: incomplete, empty}` or `{result: wrong, wrongCells?}` | cooldown, `STALE`, closed |

No request carries a selected cell, current word or current clue (that would be the focus tracking of CE-3, blocked on governance question G1). A test asserts the exact key set of every request body.

### C.5 Checks and reveals (item 6)

| Preset | Check scope | Checks | 초성 | Reveals |
|---|---|---|---|---|
| easy | cell, word or puzzle | unlimited | yes | 3 |
| normal | a word | 5 | yes | 2 |
| hard | a word | 3 | no | 1 |

**PM decision SP-1/SP-2 (2026-10-18):** reveals 3/2/1 and checks unlimited/5/3 for easy/normal/hard; a teacher may override both. They are stored per puzzle in `settings.play` (`revealsPerStudent`, `checksAllowed`: a number, `null` = unlimited, `0` = none) and enforced by the database (`CROSSWORD_PLAY_REVEAL_LIMIT`, `CROSSWORD_PLAY_CHECK_LIMIT`). Puzzles saved before `checksAllowed` existed read as: `submitOnly` = none, otherwise unlimited. The teacher override screen is **not built** (it is a teacher-side change, to be scheduled); today the values come from the preset. The scope of normal and hard checks (a word) is an engineering assumption, see N10. (Earlier: generator starting values, CW-2…CW-4, E.2 below.) A check reads **saved** state at `baseRevision`, counts once in `checks_used` and once in the per-attempt rate window (60 a minute, stored on the attempt so it holds on serverless). Replies are three statuses; error text never contains an expected value. A wrong mark is client-only and clears when the cell is edited. A reveal is one atomic `UPDATE … WHERE reveals_used < limit`, writes the letter to `cells`, adds the key to `revealed_keys`, locks the cell. 초성 returns consonants only.

### C.6 Progress save and resume (item 7)

Dirty set of cell changes, patch sent 2 s after the last change, on `blur`, on `visibilitychange` to hidden and on `pagehide` (`keepalive`). One request in flight, in order; patches are idempotent so a retry is safe. The server **merges** (`null` removes a key) and bumps `revision`; it never overwrites the whole map, so a second device (and later a teammate) cannot erase cells. `activeMs` is clamped to 30 s per save and to wall-clock since the previous save. Status line: 저장됨 / 저장 중 / 저장 안 됨 with retry and back-off and a `beforeunload` warning while unsaved.

### C.7 Korean IME model (item 4), and the cell input model (item 5)

Two layers, deliberately separate. **Layer 1, the IME controller** (`ime/controller.ts`, pure, no DOM) turns a stream of normalized events into intents: `preview(cells)`, `commit(cells)`, `move`, `delete`, `reject`. **Layer 2, the cell model** (`cells.ts`) owns selection, navigation and cell state. The DOM hook only translates events. This makes IME behaviour testable from **recorded traces** without a browser.

**IME rules.** R1–R3 are new from the traces; R4–R10 are doc 07 C.7 points 1–9 restated; each is to be proven in F0/F3, not assumed.

| # | Rule |
|---|---|
| R1 | **Syllable hand-off is one tick.** `compositionend` and the next `compositionstart` can fire in the same millisecond, with the committed syllable still in `input.value`. The controller commits on `compositionend`, then accepts a `compositionstart` with no intervening idle |
| R2 | **Never write `input.value` or the selection while a composition is open**, including from a timer scheduled earlier. Any reset runs only when `composing` is false at the moment it executes, and is skipped if a new composition started meanwhile. Prefer a model that needs no reset: committed text = value up to the pending part, tracked by length |
| R3 | **Backspace inside a composition is a composition update, not a key.** The IME shortens `compositionupdate.data` (`산`→`사`→`ㅅ`→empty); an empty update followed by `input` `deleteContentBackward` with `isComposing` false is a composition cancel. The controller does not move or clear cells on it |
| R4 | One focus owner: a single uncontrolled `<input>` over the selected cell holds focus; cells are visual. Not one input per cell (moving focus mid-composition cancels it). No `maxLength`, no React-controlled `value` while composing, autocomplete/autocorrect/autocapitalize/spellcheck off |
| R5 | Pending text (one or more syllables) is shown as **pending** in consecutive cells from the anchor, clamped at the word end, recomputed from the whole buffer on every update (syllables change retroactively: `안`+`ㅏ` → `아`,`나`) **A long composition is not committed early** (doc 07 C.7 point 4 proposed committing all but the last syllable): the IME can still change an earlier syllable, so everything commits when the composition ends. Built in F2 (`play/ime/controller.ts`). |
| R6 | Event order is not trusted (Safari vs Chrome `keydown`/`compositionend`; Android keyboards that fire `compositionend` only on blur). Commit uses the buffer at `compositionend`, `blur`, selection change or `input` `insertText`, whichever comes first; commit is idempotent A repeated or late `compositionend` after such a commit is absorbed, so nothing commits twice. |
| R7 | While composing (`isComposing` or keyCode 229, `key` "Process"): no Backspace handling, no arrow/Tab/Enter navigation, no submit |
| R8 | A cell takes one NFC character matching `[가-힣A-Z0-9]`. A lone jamo is not committed ("글자를 완성해 주세요"); lowercase is upper-cased; NFD is normalized; emoji, spaces, symbols rejected. The SQL save function enforces the same rule: the client is a convenience, not the guard |
| R9 | Latin and digit cells: `inputmode` set, hint "영문/숫자 키보드로 바꿔 주세요". No automatic key mapping (E.10) |
| R10 | **Word-entry field** "낱말로 입력" is always present as a second path. It needs no composition handling in the grid, serves keyboard and screen-reader users, and is the primary input if F0 fails on a gate device (E.12) |

**Cell input model.** A cell is in exactly one state: `empty`, `typed`, `pending` (composing), `given` (prefill, locked), `revealed` (locked). `checked-ok` / `checked-wrong` are client-only overlays. The selection is `(cell key, direction)` and is client-only. Rules: tap selects the cell and its word; a second tap at a crossing toggles direction; a one-cell word is reachable at its cell in the direction the host word does not use and has its own numbered clue; Tab/Shift+Tab go to the next/previous clue; arrows move; Backspace outside composition clears the cell or, if empty, steps back; after a commit the selection advances to the next cell of the word and stops at the last cell. Locked cells are skipped by typing and refused by the server.

### C.8 Completion detection (item 8)

Decided **only by the server, only on an explicit submit**. Any empty cell → `incomplete` with the count of empty cells (tells nothing about correctness). All correct → `completed`, sets `completed_at`, writes a `completed` event, returns `justCompleted: true` once. Otherwise `submits_used += 1`, `last_wrong_submit_at`, and the reply carries the wrong-cell count on easy and normal or only "조금만 더 살펴볼까요?" on hard, with a cooldown (E.4 of doc 07). A repeat submit on a completed attempt is a no-op that returns `completed` with `justCompleted: false`, so the celebration cannot replay. A check that finds everything right only makes the UI **offer** 제출 (one transition only, so `hard` learns "all correct" no other way). The evaluation uses `cells` plus the puzzle, never the member, so the same function can later judge a team attempt.

### C.9 Student security model (item 11)

1. **No answer in Node on any student path.** Student code never selects `crossword_words.answer`; check, reveal, 초성, submit, given letters and cell validity run inside SQL. Prefill uses a placeholder puzzle, because `choosePrefill` reads only answer **lengths**; a test pins identical keys for real and placeholder puzzles.
2. **No client-supplied identity.** Student id from the session; attempt id verified against membership in SQL; assignment id verified by the access function. IDOR gets the same not-found.
3. Server-side time (`now()`), never the client clock.
4. Output allow-list; check replies are enums; errors never echo expected values or other students' data.
5. Abuse limits in the database (rate window, submit cooldown, patch size, `activeMs` clamp). No in-memory limiter (serverless).
6. Same-origin check on every JSON handler, `no-store` everywhere.
7. `server-only` on everything that touches the database; a test checks the import graph of client components.
8. No student-to-student information in any payload. Logs carry no cell content or letters.
9. **Because the server uses the service-role client for student data (as the M1 pages do), RLS does not protect the key on that path; the shape of the code does.** That is why rules 1, 4 and 7 are enforced by tests, not by convention.

### C.10 RLS and API exposure review (item 12)

| Surface | Today | M2-2.4 | Pinned by |
|---|---|---|---|
| `crossword_words/puzzles/assignments/preview_tickets` via PostgREST, student JWT | RLS on, no student policy: zero rows | unchanged | pgTAP |
| `v_crossword_puzzles_summary` (`security_invoker`, no answer column) | zero rows for a student | unchanged | pgTAP |
| New `crossword_attempts/_members/_events` | n/a | RLS on, **no policy**; a student cannot read even their own row; a teacher policy is M2-2.5 | pgTAP |
| `fn_*` over `/rest/v1/rpc` | revoked from `anon`, `authenticated` | every new function the same | pgTAP `has_function_privilege` false for all `fn_crossword_*` |
| Realtime | no `crossword_*` in any publication | none added; attempt tables must not be published | pgTAP on `pg_publication_tables` |
| `.select()` column lists | teacher code selects `answer` (allowed) | student code never does | static test over `play/` and `app/student/crosswords/` |
| Payload and every reply | n/a | no `answer`/`solution`/`key` field; no answer substring of 2+ characters | flow test over every fixture word |
| Reveal/check as oracle | n/a | statuses only; no "already correct" refusal (§0.2 #1); rate window and counters | flow tests |
| Caching | n/a | `no-store` | header test |
| Allowed letter exits | n/a | prefill and each counted reveal; nothing else, including after completion | flow test |

---

## D. UI pages (items 1, 3, 9, 10, 13)

Student area only, behind `requireStudentAreaPage`. Mobile first: school devices are tablets, and the soft keyboard covers half the screen. Bar: 360 and 400 px, 44 px targets, 16 px inputs, contrast, named scroll regions, live regions, no colour-only state, axe clean (the teacher hardening record is the reference).

| Route | Phase | Content |
|---|---|---|
| `/student` | 2.4b | one added block "풀 수 있는 퍼즐 n개" with a link; nothing else changes |
| `/student/crosswords` | 2.4b | the list |
| `/student/crosswords/[assignmentId]` | F3 (bare) → 2.4b | play |
| `/student/crosswords/[assignmentId]/result` | 2.4b | result, also the target for completed and closed attempts |

**List.** Card per assignment: title, classroom, word count, level, closing time, state, one button. States: **새 퍼즐**, **이어하기** (with "채운 칸 n/N"), **완료**, **마감** (only if an attempt exists). Same puzzle in two classrooms = two rows (CW-9). Order: in-progress, new (soonest closing first), completed.

**Play.**

```
wide                                              phone
┌ title ───────────────── 저장됨 ┐                  ┌ clue bar (pinned) ┐
│ GRID (named scroll region)  │ 가로 1. … │         │ GRID (scrolls, never the page)
│                             │ 세로 2. … │         ├ 낱말로 입력 ──────┤
├ 초성 | 글자 알려주기(n) | 확인 | 제출 ┤            └ tools bar above keyboard (visualViewport)
```

The grid is drawn from structure plus `cells` and `given`; it never needs the key. Cells are at least 32 px and the board scrolls. Closed/read-only: banner, inputs disabled, cells visible.

**Completion moment (item 9).** Triggered only when the server returns `justCompleted: true`.

1. A short decoration around the puzzle, never over it: a congratulation line ("퍼즐을 완성했어요!"), the finished grid settling, a brief highlight sweep over the words. It never covers, blurs, fades or shrinks cells or clues (CE-11, doc 06 §12.9 #1).
2. Two seconds at most. No flashing, no sound by default, dismissible with one key or tap. With `prefers-reduced-motion` a static message replaces it.
3. Announced once in a polite live region; focus moves to the result heading after dismissal, not during.
4. The primary button is the **next step**: "다음 퍼즐 풀기: <title>" if another playable assignment exists (rule: the oldest open assignment the student has not started or not finished, never chosen by score), else "다른 퍼즐 보기", else "학생 홈".
5. Reopening a completed attempt never replays it.

**Result (item 10), in the approved order.**

| Order | Block | Content |
|---|---|---|
| 1 Progress | what was achieved | the student's own finished grid (from their cells), "퍼즐을 완성했어요", number of words |
| 2 Growth | slot | **empty in this phase** (`growth: null` in the view model). Own-past comparison needs history and governance (product note 01 §2, §5); the slot exists so the profile fills it without a redesign |
| 3 Tools | how help was used | "도구를 활용했어요: 확인 3번, 글자 알려주기 1번, 초성 2번", or "도구 없이 스스로 풀었어요". No fractions, no minus, no "penalty", no colour that signals bad |
| 4 Next | what to do next | the button of the completion moment |

Also active time in minutes. Nothing about any other student. A closed-unfinished attempt gets the same layout with the closed notice and no correctness marks. A catalogue test fails if `play/messages.ts` contains score-like patterns ("점", "감점", "n/n" hint fractions, penalty words).

**Accessibility (item 13).** Target WCAG 2.2 AA with the teacher-hardening tools.

| Area | Requirement |
|---|---|
| Keyboard | every action reachable without a pointer; arrows, Tab/Shift+Tab by clue, a documented shortcut list; no trap; visible focus; no positive `tabindex`; shortcuts inactive while composing (R7) |
| Screen reader | `role="grid"`; cell names such as "가로 1번, 2글자, 첫 번째 칸, 입력됨"; one-cell words announced as such; real clue lists, current clue `aria-current`; checks, reveals, save status and read-only changes in polite live regions; pending text announced as "조합 중", never as entered |
| Open risk | with one proxy input as the focus owner, the screen reader's focus is on the input, not on a cell. The input's accessible name must follow the selected cell. Whether TalkBack/NVDA read this acceptably is **unknown** and decided by the manual session in 2.4c; the word-entry field (R10) is the accessible path until then |
| Colour and state | correct, wrong, given, pending, selected told apart by icon/text/pattern too; contrast 4.5:1 text, 3:1 borders and focus |
| Touch and zoom | 44 px buttons; usable at 200% text and 320 px; portrait and landscape; 16 px inputs |
| Motion and time | no time limit; completion moment per above |
| Language | `lang="ko"`; spoken hint on Latin/digit cells |

---

## E. Open PM decisions

Already answered in doc 07 (2026-10-17): **E.5** one attempt per student and assignment, no restart; **E.6** minimal events table with word number and direction; **E.12** device list (below); practice mode out of scope for M2-2. Still open there, recommendation unchanged: E.1 (go-live governance gate), E.2 (presets and check scopes), E.3 (prefill/reveal letters are allowed exits), E.4 (wrong-submit feedback and cooldown), E.7 (Playwright), E.8 (word entry always present), E.9 (identical prefill), E.10 (hint only for Latin keys), E.11 (superseded version, no carry-over), E.13 (120 s grace), E.14 (list placement).

**New in this plan:**

| # | Decision | Recommendation |
|---|---|---|
| N1 | **Phase boundary.** Foundation = F0–F3 including a bare, unstyled play board, so the real component is validated on devices before any screen work. List/result/completion polish is 2.4b | Yes. The alternative (no board until 2.4b) delays the first real-component IME test by a whole phase |
| N2 | **Who runs the device sessions.** F0 and the F3 re-validation need the PM or a teacher with the Galaxy S24, Tab S9 and a Windows machine, about 30–45 minutes per device/browser | PM names the person and the week; engineering supplies a one-page script |
| N3 | **Reveal semantics** (§0.2 #1): a reveal always spends one and returns the letter, never says "already correct" | Yes |
| N4 | **Fallback trigger.** If method A fails on Samsung Internet after the v2 fix, word entry becomes the primary input and the grid is display plus selection | Yes (already doc 07 H.1); confirm that a slower, field-based input is acceptable on Galaxy devices |
| N5 | **Result "Growth" slot** stays empty in 2.4 (§D) | Yes |
| N6 | **Completion moment intensity.** Text, grid settle and a brief highlight, no sound, no confetti, reduced-motion respected. Is a teacher on/off switch wanted? | No switch in 2.4 (CE-11 effects policy is for exploratory effects; this is a feedback moment); revisit if a teacher asks |
| N7 | **Next-puzzle rule** (§D point 4) | Yes |
| N8 | **List shows closed puzzles that have an attempt**, hides closed ones that do not | Yes |
| N9 | Windows trace evidence: should Chrome/Edge on Windows count toward the gate, or only the Galaxy devices? | Count them (PM listed them); the Galaxy devices decide go/no-go for input method A |
| N10 | **Scope of the new checks** (SP-2): normal and hard allow 5 and 3 checks of a **word** each (cell and puzzle scope stay easy-only). Hard changes from "no checks" to "3 word checks", so the hard check mode is now `onRequest` and the hard cooldown after a wrong submit is unchanged | Yes; widen the scope only if a teacher asks |
| N11 | **`words_completed`: DECIDED (PM, 2026-10-18).** The server computes it once at submit when the attempt completes and writes it into the `completed` event as `{"wordsCompleted": n}`; never shown to the student; governance entry added in doc 14 §1. `actor_id` already exists as `actor_student_id` on every event. Built in F1 (migrations 000002/000003, pgTAP 00013). No running count and no value on wrong submits (that would be a free check and per-word correctness) | Done |

---

## F. Future compatibility risks (shared attempt, team mode)

Doc 07 F.1–F.3 stands in full (attempt/payload/check/reveal/submit keyed by attempt and puzzle; counters on the attempt; plain `cells`; assignment-id URL; member table; rejected alternatives). Constraint source: doc 06 §11.8 and §12.8. Nothing here builds teams, sharing, live updates, focus, presence or help requests. Risks added or sharpened by this plan:

| # | Risk | Mitigation now | What M2-3 has to do |
|---|---|---|---|
| 1 | Last-writer-wins on `cells` | merge patches, `revision`, `baseRevision` on every write and on check/submit | per-cell conflict rule and a separate `cell_authors` table, written from the start of M2-3.4, never retrofitted onto `cells` |
| 2 | **`active_seconds` on the attempt cannot be split per member.** The profile (product note 01 §5) wants per-student speed; a shared grid gives one number | keep it on the attempt as approved (doc 06 §12.8); individual play has one member so it is exact | add member-level seconds as an additive column on the member row; team-level history only until then |
| 3 | `unique (assignment_id, student_id)` forbids two shared grids per student per assignment | fine for one grid per team or class | end-dated membership instead of dropping the key, if a student may change team |
| 4 | Erasure of one member of a shared attempt (G4) | the trigger deletes an attempt only when its **last** member is erased | governance decides keep-and-detach vs delete; trigger and pgTAP case are where it changes |
| 5 | Team resources change who owns reveal/check limits | limits resolved in `fn_crossword_attempt_limits`; atomic `UPDATE … WHERE counter < limit` on one row already serializes teammates | return a team pool for a collaborative assignment |
| 6 | Live transport | none; attempt tables are not published and have no student policy | polling on `revision`, a server stream or authorized Broadcast, decided in M2-3.4 |
| 7 | Payload must not reveal who else is on the attempt | no member data; `v` field | generated nicknames only, as a later payload version |
| 8 | Completion semantics (who may press 제출) | submit takes an attempt, not a student | any member, vote or teacher; same function |
| 9 | **Completion moment is per student** | triggered by `justCompleted` from the server | a shared completion needs one event shown to every member; the flag must not be stored on the attempt as "seen" |
| 10 | The IME controller must not assume the typist is the owner | it emits intents on a cell map and knows no identity | none |
| 11 | Accidental focus/selection tracking | save and check bodies exclude selection, word and clue; key-set test | none until G1 is answered |
| 12 | Result view-model growth/achievement slots filled with stored scores | slots are `null`; nothing derived is stored | compute from attempts plus a versioned rule (doc 06 §7.4) |
| 13 | Teacher-side pin `crossword-hardening.test.ts:75` blocks M2-2.5 results | all student code is in new files | M2-2.5 amends the pin deliberately |

---

## G. IME validation requirements

The IME is the largest risk of the phase (doc 04 §9). Nothing in F1–F3 depends on its outcome except `ime/*`, the bare board and the choice of primary input, so F0 runs first and in parallel with F1.

### G.1 Matrix (PM, 2026-10-17)

| Device | Browsers |
|---|---|
| Galaxy S24 | Samsung Internet, Chrome |
| Galaxy Tab S9 | Samsung Internet, Chrome |
| Windows 11 desktop/laptop | Chrome, Edge |

Each: portrait and landscape (phone and tablet), soft keyboard and, where available, hardware keyboard (tablet and Windows). Out of this round: iPadOS/macOS Safari, ChromeOS, other Windows browsers; they can be added later.

### G.2 Lab v2 (before any more device runs)

The three existing traces are valid raw data but were produced by a lab with a defect (§0.3). Requirements for v2, in `scripts/ime-lab/` only:

1. Remove the deferred `idleReset`; apply R2 (no value or selection writes while composing; no timer that can fire into an open composition). Keep the sentinel variant as an option.
2. Treat `compositionend` + immediate `compositionstart` as one hand-off (R1) and log it as such.
3. Treat empty `compositionupdate` + `input` `deleteContentBackward` (`isComposing` false) as a composition cancel (R3).
4. Revise the c6/c7 expectations to the unwinding behaviour actually produced by the IME, and have the judge accept either unwinding order that ends in the same text. Tester verdict remains the tie-break.
5. Record per run: user agent, viewport, orientation, keyboard type, keyboard app (Samsung keyboard / Gboard / Microsoft IME), prediction strip on/off, input method (A/B/C).
6. Keep the old traces in `traces/` marked `v1` and do not mix them into the v2 matrix. They remain the fixtures for R1–R3.

### G.3 Cases and pass criteria

Cases c1–c10 as in `scripts/ime-lab/README.md` (one cell, syllables, batchim hand-over, double final, fast typing, Backspace during and after composition, focus after commit, paste, Latin/digit). Success criteria are the PM's:

| SC | Criterion | Judged by |
|---|---|---|
| SC1 | no duplicated characters | automatic |
| SC2 | no dropped characters | automatic |
| SC3 | no premature focus change during composition | automatic (blur while composing) |
| SC4 | Backspace correct during active composition | automatic + tester |
| SC5 | each Korean syllable commits exactly once | automatic |
| SC6 | input usable on Samsung Internet | tester, written verdict |

A device/browser **passes** when c1–c9 pass SC1–SC5 with no tester fail, and the tester records SC6 where Samsung Internet is involved. c10 (Latin/digit) is advisory (E.10).

### G.4 Decision table

| Result of method A (proxy input) | Decision |
|---|---|
| passes on every row of G.1 | proxy input is the grid's input; word entry stays as the second path |
| fails only on a Windows browser | fix in the controller or document the browser; not a gate on its own |
| fails on Samsung Internet (either Galaxy device) | **word entry is the primary input**; the grid is display plus selection; method B only if it passes where A fails |
| fails on Chrome for Android but passes on Samsung Internet | PM decision: Samsung Internet only, or word entry primary |

### G.5 Second validation, on the real component

A pass in the lab does not transfer automatically: React rendering, autosave and the soft-keyboard viewport are not in the lab. After F3, the same cases are repeated on the bare board of the real build on every row of G.1, plus: type while an autosave is in flight; switch cell mid-composition; rotate the device during composition; leave the page during composition (R6: `pagehide` commits the visible pending syllable exactly once and never a lone jamo; nothing doubles or disappears); keyboard prediction strip on. The result is written into the 2.4c hardening record.

### G.6 Fixtures

Every device run's JSON becomes a fixture under `tests/fixtures/ime/<device>_<browser>_<orientation>_<case>.json` and drives the pure controller tests (F2). The two Windows v1 traces for c3 (Edge) and c8 (Chrome) are kept as regression fixtures for R1/R2 even though v2 supersedes them.

### G.7 What cannot be automated

CDP `Input.imeSetComposition` can simulate composition in Chromium (E.7), which covers R1–R3 shapes and regressions, but not Samsung Internet, Gboard, the Samsung keyboard or the Microsoft IME. Real-device sessions are required and are recorded as a table; emulation never counts toward SC6.

---

## H. Phases and test strategy

One commit per step, each green on its own: `db reset`, `test db`, `db:types` no diff, `test:access`, typecheck, lint, build.

| Step | Delivers | Depends on |
|---|---|---|
| **F0** IME validation | lab v2 (G.2); runs on the G.1 matrix; traces; per-device verdict; the G.4 decision | N2 (people and devices) |
| **F1** Schema | migrations `…000001–3`, pgTAP, `db:types`, the two replaced pins, draft governance text | none (parallel with F0) |
| **F2** Play core | `constants`, `types`, `messages`, `chosung`, `cells`, `prefill`, `ime/controller` built from F0 traces; pure tests | F0 traces, F1 limits |
| **F3** Service, handlers, bare board | `access`, `payload`, `service`, `api-guard`, six handlers, `use-grid-input`, unstyled board; flow, static and security tests; G.5 re-validation | F1, F2 |
| 2.4b Screens | §D | F3, G.5 outcome |
| 2.4c Hardening | Playwright smoke (if E.7), axe, budgets, screen-reader session, security review of C.9–C.10, hardening record, governance text to the PM | 2.4b |

**Entry:** F0 needs N2. F1 needs nothing. **Go-live gate:** E.1 and the 2.4c record. **Definition of done for 2.4a (Foundation):** an enrolled student can open an open assignment on the bare board, type Korean on every row of G.1 without lost or doubled letters (or the G.4 fallback is chosen and works), autosave and resume across two clients, use the tools the preset allows, submit and complete; no payload, reply, error or client file contains the key (tests prove it); teacher-side code is byte-identical to `0e781cf` apart from the two replaced pins; all gates are green.

**Test strategy (item 14).**

| Layer | What | Where |
|---|---|---|
| Pure | `chosung` goldens (double consonants, Latin, digits, mixed); `cells` (keys, one-cell words, navigation, `isValidCellChar`); **prefill equivalence** (real vs placeholder puzzle, many seeds, never completes a word); messages (no score-like wording, no answer placeholder); constants pinned to SQL limits | vitest `tests/access/crossword-play-*.test.ts` |
| IME controller | trace-driven: syllable hand-off (R1), no value write while composing (R2), Backspace unwinding (R3), batchim re-split, long composition, lone jamo, blur and cell change mid-composition (no double commit), NFD, paste clamped at word end, keys ignored while composing | vitest + `tests/fixtures/ime/` |
| Database | student JWT: zero rows on every `crossword_*` table and view; no execute right on any `fn_crossword_*`; no `crossword_*` in a publication; access matrix; start twice in one transaction = one attempt; save/check/reveal/submit rules; `STALE`; event `detail` CHECK; erasure cascades; the two replaced pins | pgTAP `00013_crossword_play.test.sql` |
| Flow | teacher publishes → student signs in → list → open → type via save → resume from a second client → check → reveal → submit → result; payload and every reply contain no answer key or 2+ character answer string; check replies are the three statuses; **10 parallel reveals at limit 1 give exactly one success**; parallel saves merge; IDOR gives the same not-found; closed/removed/archived/superseded block play; `no-store`; foreign `Origin` rejected; exact request key sets; `justCompleted` true once | vitest against the local stack |
| Static | no `select("*")` or `answer` in `play/**` and `app/student/crosswords/**`; client components import nothing `server-only`; no `localStorage` use of cells; no new file under `src/components/teacher/` or `review/` | vitest |
| Browser (2.4c) | Playwright Chromium with CDP IME simulation (E.7); axe-core 4.10 at 360/400 px; keyboard-only run; reduced-motion replaces the celebration | new dev dependency, small |
| Devices | G.1 matrix on lab v2 and again on the real board; TalkBack and NVDA session | manual, recorded |
| Budgets | payload under 20 kB for 25 words; first-load JS of the play page under 130 kB; handler times on the local stack, 10x margin | pinned like doc 05 §13 |

Order inside a step is test-first for the pure layers (the IME controller is written against fixtures, not the reverse).

---

## F3 status (2026-10-18)

Built: server modules (`play/errors|access|payload|service|api-guard|schemas`), six handlers under `/student/crosswords/[assignmentId]/api/`, the page `/student/crosswords/[assignmentId]` and the bare board (`components/student/crossword-play-board`, `use-grid-input`, `save-queue`, `play-api`). Not built (2.4b): list page, result page, completion moment, `/student` block, final layout and accessibility work.

- **PM SP-3 (save state).** The board and the `SaveQueue` expose three states: `saving`, `saved`, `offline` (texts in `PLAY_TEXT`: 저장 중, 저장됨, 오프라인 · 아직 저장되지 않았어요). `offline` means the last request failed on the network or the browser reports it is offline; nothing is lost and it retries with back-off and at once when the connection returns. A refusal by the server (closed, read-only) is not "offline": it is `blocked` with the stable code, and the board shows the closed notice instead of the indicator. The indicator is a polite live region with `data-save-state`.
- **Identity.** The student id comes only from the session profile (`getStudentIdForProfile(profile.id)`); no handler, schema or client code accepts a student id or an attempt id (the attempt is found from the URL's assignment id and the session). Tests send `studentId`, `attemptId`, `selected`, `currentWord`, `currentClue` and `focus` in every body and expect 400.
- **Answers.** The payload is built field by field from explicit columns; the key never leaves the database except one counted reveal and the `given` cells. Tests assert no answer string of two or more characters appears in the payload or any reply, and that check replies carry no letter.
- **Concurrency.** Ten parallel reveals at one base revision give exactly one success (the rest `STALE`), and parallel saves from two devices merge.
- **Device procedure** is in [09](09-g5-device-validation.md): seed (`pnpm dev:seed-play`), a production build served on the LAN, the case list, the recording of IME events (`?imetrace=1`) and the result table. Verified before handing over: sign-in, the board and all tools on the built app, the three save states, and the LAN address over plain http (see the Origin fix below).
- **Origin check.** Browsers send `Sec-Fetch-Site` only to secure contexts; over plain http on a LAN address it is absent, and `request.url` carries the bind address behind `next start -H 0.0.0.0`. The guard now compares `Origin` with the `Host` header. Found while preparing the device run: every phone save would have been refused (403) before this.
- **Blocked banner.** A refused save no longer always reads "closed": it names its reason (closed or read-only, or "sign in again" when the session/permission was the cause).
- **Not automated.** The hook and the board have no browser test (E.7 is not decided). Input on real devices is the G.5 validation, to be done on the bare board: Galaxy S24 and Tab S9 (Samsung Internet, Chrome) and Windows (Chrome, Edge), against SC1 to SC6.
- **Opening the board.** It needs a published assignment for a classroom the student is enrolled in, and a student account with the forced password change done. Do not use real students before the governance gate (doc 14 approved, doc 13 re-signed). There is no link to the page from the student home on purpose.

## Appendix: the 14 design items

| # | Item | Section |
|---|---|---|
| 1 | Student puzzle list | A, D |
| 2 | Assignment access | A, C.2 |
| 3 | Puzzle play screen | D |
| 4 | Korean IME model | C.7 (R1–R10), G |
| 5 | Cell input model | C.7 |
| 6 | Checks and reveals | C.5, §0.2 #1 |
| 7 | Progress save/resume | C.6, A |
| 8 | Completion detection | C.8 |
| 9 | Completion moment UX | D |
| 10 | Result screen | D |
| 11 | Student security model | C.9 |
| 12 | RLS / API exposure review | C.10 |
| 13 | Accessibility | D |
| 14 | Test strategy | H |
