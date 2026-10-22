# 20. TalkBack validation plan (Student Play)

Status: **PLAN, APPROVED by the PM on 2026-10-22; the PM decisions of that day are applied (§10). NOTHING IS EXECUTED.** Documents only: no code, DB work, deployment or flag change. It defines how the student side of Student Play is validated with **TalkBack** on the Galaxy Tab with Chrome, so that a real screen-reader session replaces the design targets of [07](07-m2-2-4-student-play-plan.md) D.5. Related: [11](11-student-play-release-readiness-audit.md) §8 and condition C-2, [09](09-g5-device-validation.md) §9 (hosted acceptance procedure), [08](08-m2-2-4a-student-play-foundation-plan.md).

Order set by the PM: this plan runs **after the Galaxy Tab validation is finished and after the database-connected deployment is ready** (PM, 2026-10-22). It is Phase 7 of the integrated plan [21](21-hosted-acceptance-and-galaxy-tab-validation-plan.md). The approvals of §8 still apply.

## 1. Existing evidence (what is known, what is not)

| Evidence | What it shows | Source |
|---|---|---|
| Design targets | Grid as `role="grid"` with named cells ("가로 1번, 2글자, 첫 번째 칸, 입력됨, 사"), clue lists as real lists with `aria-current`, polite live regions for save state, check results and selection, a pending syllable announced as "조합 중", a non-visual alternative (the word-entry field), no time limits, `lang="ko"`, 44 px targets, completion moment off under reduced motion and dismissible | `m2/07` D.5 |
| axe-core 4.10 (WCAG 2.0, 2.1, 2.2 A and AA, best practice) | **0 violations** on the play page at 360 × 740, 800 × 1280 and 1280 × 800, the puzzle list and the student home | `m2/11` §8, run on a PC browser 2026-10-18 |
| Unit and static tests | cell names and wording, roles and labels, buttons at least 44 px, 16 px inputs, forbidden score-like words, reduced-motion wiring | `crossword-play-ui*.test.*`, `crossword-play-core` |
| Teacher side | keyboard and screen-reader structure checked with axe and contrast script; not with a real screen reader | `m2/05` §13 |
| **Not verified** | **Any real screen-reader session** (TalkBack on the tablet, NVDA on Windows), keyboard-only run on hardware, 200 % text zoom, behaviour of the live regions in speech, whether the grid cells can be activated through TalkBack | `m2/11` §8 |

axe checks rules, not how the page *sounds* or whether a task can be finished. This plan covers that gap.

### 1.1 Design facts to confirm (read from the code; each one is a risk if wrong)

| # | Fact in the code | Why it matters for TalkBack |
|---|---|---|
| D1 | Grid cells are `div role="gridcell"` with `tabIndex={-1}`; selecting a cell is wired to **`onPointerDown`** (with `preventDefault` to keep the input focused), not to a click or key handler (`play-grid.tsx`) | TalkBack activates an item with a double tap, which Android delivers as an accessibility click. Whether Chrome turns it into the pointer events the cell listens to is **not established**. If it does not, the grid cannot be used to select a cell through TalkBack |
| D2 | The reliable way to choose a word is the **clue list**: every clue is a real `button` that calls `selectWord`, which also focuses the input (`play-clues.tsx`) | This is the designed non-grid path; it must be fully usable |
| D3 | One uncontrolled input "글자 쓰기" (named per selected word and cell, `aria-describedby` the instructions) receives the Korean letters; a second field "낱말로 입력" with a "넣기" button writes a whole word | TalkBack typing echo, IME composition and the speech after each syllable |
| D4 | Live regions: the message line (`role="status"`), a screen-reader-only selection announcement (`role="status"`), the save indicator (`role="status"`), the completion banner (`role="status"`), errors as `role="alert"` | Several polite regions can talk over each other; the save indicator changes text on every autosave |
| D5 | The selection announcement ("가로 1번, 2번째 칸. 단서: …") fires **whenever the selected cell changes**, so after every typed syllable | Possible repetition of the clue text while typing |
| D6 | The pinned tools bar (확인, 글자 알려주기, 초성 보기, 제출) is fixed at the bottom and the clue bar is sticky at the top; the soft keyboard resizes the page (`interactiveWidget: resizes-content`) | Swipe order versus visual order; whether the bar stays reachable with the keyboard open |
| D7 | "글자 알려주기" asks for confirmation with the browser's native `window.confirm` | Native dialog behaviour with TalkBack, and with an open composition |
| D8 | After a successful submit the completion banner takes focus and, **unless the device asks for reduced motion, the page moves to the result after about 2.6 seconds on its own**; the banner can be dismissed by tap, Enter or Escape (`completion-moment.tsx`) | Speech may be cut off by the automatic move; WCAG 2.2.1 timing |
| D9 | The check marks ✓ ✗ and the cell number labels are `aria-hidden`; the mark and the letter are in the cell's accessible name | Only the cell name carries them |
| D10 | `aria-rowcount` counts only rows that contain word cells, and non-word cells are `aria-hidden` filler divs | The row and column positions TalkBack speaks may not match the visible grid |
| D11 | The list card shows the filled cells as text and as a `progress` element with its own label | Possible double reading |
| D12 | The student home shows the classroom code in a `code` element with wide letter spacing | Spelled letter by letter; minor |

## 2. Scope

### 2.1 In scope

- **Student side** on a **Galaxy Tab with Chrome and TalkBack**: first sign-in with a temporary password and the forced password change, student home, puzzle list, play screen, tools (check, reveal, 초성), save and offline states, submit and completion, result screen, read-only (closed) state.
- Both input paths: the **word path** (clue list, the "글자 쓰기" field, the "낱말로 입력" field) and, as far as it works, the **grid path** (explore by touch, selecting a cell).
- Portrait and landscape; the system font size and display size at larger settings.

### 2.2 Out of scope (separate items)

NVDA or other desktop screen readers, VoiceOver, Samsung Internet (secondary browser; run only if the PM asks), the teacher screens including the TV-1 progress table, braille displays, voice control, switch access, TalkBack on phones other than as a spot check, and the Korean IME accuracy validation itself (that is the device plan of [09](09-g5-device-validation.md), run with a sighted tester; this plan only checks that typing works *with* TalkBack on).

### 2.3 Not covered by passing this plan

A pass means the student flow can be completed with TalkBack on the tested device and settings. It does not certify WCAG conformance of the product and does not replace the device validation of 09 (SC1 to SC6).

## 3. Environment and prerequisites

| Item | Requirement |
|---|---|
| Device and software | Galaxy Tab (the model of the school's tablets), Android version, **TalkBack version**, Chrome version, **Samsung Keyboard (required)**, TalkBack language Korean. All recorded in the evidence sheet |
| TalkBack settings | default speech rate and verbosity first; typing mode: both "standard typing" (double tap to type) and touch typing **if the device offers them**; record the settings used. **Keyboard: Samsung Keyboard is required** (PM, 2026-10-22); Gboard is optional, as an extra run if time allows |
| Network | the hosted acceptance setup of `m2/09` §9: HTTPS, school Wi-Fi or the intended classroom network. A dry run on a local LAN (HTTP) is useful for finding obvious problems but is **not** acceptance |
| Accounts and data | **test accounts and test puzzles only** (`SMOKE`): one test student whose first sign-in (temporary password and forced change) is part of the scenarios; a published test puzzle in a test classroom with at least 12 words, including a word of 3 or more cells and a one-cell word if the generator produced one; a second small puzzle that can be finished quickly; no real student, no real classroom |
| Feature flag | switched on only for the agreed window, recorded (start and end) and switched off afterwards (`m2/09` §9.1 and §9.2) |
| Approvals | the approvals of `m2/09` §9.1 and, for creating the test data on the pilot project, the approval described in `m2/18` §2 (PM). This plan creates nothing itself |
| People | **Tester: an accessibility-trained engineer is preferred** (PM decision, 2026-10-22); real TalkBack users are welcome but are **not required for the release gate**. The report states who the tester was, because an engineer is weaker evidence than a daily TalkBack user (R8). **Observer:** records and does not help, and is a different person from the tester |
| Time | about 3 hours for one tester including setup; a second session for the keyboard variant |
| Order | **after the Galaxy Tab validation is finished and the database-connected deployment is ready** (PM, 2026-10-22), on the same deployment, so that typing already works without TalkBack |

## 4. Scenarios

Priority **P1** must pass for the plan to pass; **P2** informs severity decisions. "Expected" lists what the tester must be able to do and hear. Short phrases below are what the code intends to say; the exact words may differ and the tester records what was actually spoken.

### Scenario list

| ID | Scenario | Priority |
|---|---|---|
| T1 | Sign in with a temporary password and change it | P1 |
| T2 | Student home and puzzle list | P1 |
| T3 | Open a puzzle and understand the page | P1 |
| T4 | Choose a word through the clue list (word path) | P1 |
| T5 | Type a word and move on (word path, including "낱말로 입력") | P1 |
| T6 | Use a tool: check, reveal (confirmation), 초성 | P1 |
| T7 | Submit: incomplete, wrong, then completed | P1 |
| T8 | Result screen and next step | P1 |
| T9 | Grid path: move over the grid and select a cell | P2 (see rule R3 in §6) |
| T10 | Save, offline and recovery | P2 |
| T11 | Read-only (closed) puzzle and error messages | P2 |
| T12 | Orientation, soft keyboard and system font size | P2 |

### T1. Sign in with a temporary password and change it (P1)

Steps: open the sign-in address with TalkBack on; reach the user name and password fields by swiping; sign in with the temporary password; reach the forced password change page; set a new password; arrive at the student home.

Expected: both fields are announced with their labels ("아이디", "비밀번호"), the button is reachable and named; a wrong password produces an **announced error** (`role="alert"`) without the tester having to find it; the change-password page names both fields; success lands on the home with the heading read.

### T2. Student home and puzzle list (P1)

Steps: read the home with headings navigation; open the list; move through the cards.

Expected: the page title and headings give orientation ("학생 홈", "내 학급", "풀 수 있는 퍼즐"); each card reads state, title, class, word count, level, filled cells (without being read twice in a confusing way, D11), closing time, and **one** clear link whose spoken name includes the puzzle title; an empty list says so in words. The classroom code is understandable (D12, minor).

### T3. Open a puzzle and understand the page (P1)

Steps: open a puzzle; use linear swipes from the top to the bottom, then headings and controls navigation.

Expected: the puzzle title is the first heading; the save state is spoken; the current clue (word number, direction, length, clue) is found at the top; the grid region has a name, the input and the word-entry field have clear names and the instructions are available (`aria-describedby`); the clue lists are headed 가로 and 세로 as real lists; the tools bar is reachable; **the linear order is coherent** (nothing important is only reachable by touch exploration), D6.

### T4. Choose a word through the clue list (P1)

Steps: from the clue list activate a clue (double tap); then check where focus is.

Expected: the selection is spoken once ("가로 n번 … 단서: …", D5), focus moves to the letter input, and the tester can tell which word and cell is current; the current clue is marked (`aria-current`) and spoken as current when revisited.

### T5. Type a word and move on (P1)

Steps: with a 2-syllable word selected type it with the keyboard in both TalkBack typing modes; then a 3-syllable word; use Backspace; then use "낱말로 입력" with a whole word and press "넣기"; repeat on a word that crosses another.

Expected: typed syllables are echoed sensibly by TalkBack; a syllable being composed is not announced as committed ("조합 중" for the pending cell, D9); the **selection announcement does not repeat the whole clue after every syllable in a way that makes typing unusable** (D5; if it does, severity per §6); the word-entry field places the word in the selected word's cells and the result is confirmed in speech; typing a character that is not allowed (a lone consonant) gives a spoken message; no letter is lost or doubled. The IME correctness itself is judged by 09; here the question is whether TalkBack interferes.

### T6. Use a tool: check, reveal, 초성 (P1)

Steps: activate "낱말 확인" and read the result; "글자 알려주기" and its confirmation; "초성 보기"; try a disabled tool.

Expected: after a check the result is **spoken** ("다시 볼 칸이 n개 있어요" or the all-correct text) and the cell names change to include "맞음" or "다시 보기"; the remaining counts are part of the button names ("남은 n번"); the reveal confirmation (native dialog, D7) can be read, answered and does not leave TalkBack stuck, also while a syllable is pending; the revealed cell is described as given; 초성 is spoken with the clue; a disabled tool is announced as unavailable (and, if the page does not say why, that is recorded as a finding).

### T7. Submit: incomplete, wrong, completed (P1)

Steps: submit with empty cells; fill all cells wrongly and submit; on a hard puzzle submit twice quickly to see the wait message; fill correctly and submit.

Expected: the message for each case is spoken without the tester searching for it ("아직 빈 칸이 n개 있어요.", "아직 틀린 칸이 있어요. 조금만 더 살펴볼까요?" or the count version, and the waiting seconds); on completion **"퍼즐을 완성했어요!" is announced once** and focus is on the "결과 보기" button; **the automatic move to the result (about 2.6 s, D8) does not cut the announcement off before it is heard in full**, or the tester can stop it in time (record how the speech ended); the dismiss action works with TalkBack.

### T8. Result screen and next step (P1)

Steps: read the result from the top; check the grid region, the tool summary and the navigation links.

Expected: the finished state is the first thing heard after the title; the read-only grid is navigable and its cells are named with their letters; the tool summary is plain ("도구를 활용했어요: …" or "도구 없이 스스로 풀었어요"); the next-step links are clearly named ("다음 퍼즐 풀기: …", "다른 퍼즐 보기", "학생 홈"); no score, rank or other student is mentioned.

### T9. Grid path: move over the grid and select a cell (P2, rule R3)

Steps: with explore by touch, then swipe navigation, move over the grid; double tap a cell; observe whether the selection changes and what is spoken; try on a crossing cell for the across and down toggle; try a one-cell word.

Expected (design intent): each cell is spoken with its word, length, position in the word, state and letter; the spoken row and column positions are plausible (D10); a double tap selects the cell and the selection is announced; a second tap on a crossing toggles the direction.

Primary question: **does a double tap select a cell at all (D1)?** If not, the result is recorded as a finding and classified by rule R3; T4 to T8 must then be shown to work without the grid.

### T10. Save, offline and recovery (P2)

Steps: type and watch the save state announcements; switch the tablet to airplane mode and type; read the offline message; reconnect; reload the page; try to leave the page while unsaved.

Expected: the save state changes are announced **without constant chatter** (D4: "저장 중" and "저장됨" on every autosave); going offline produces **one** clear announcement with the help text; reconnecting returns to "저장됨"; reload restores the letters, which the tester can confirm by reading cells.

### T11. Read-only puzzle and error messages (P2)

Steps: open a puzzle that was closed by the teacher (read-only), one not yet open, and trigger the stale-revision message by saving from a second device.

Expected: "수업에서 닫힌 퍼즐입니다." (an alert) is announced; inputs are described as unavailable; the stale message is spoken and the page reloads without losing the tester's place completely; every error is spoken, not only shown.

### T12. Orientation, soft keyboard and system font size (P2)

Steps: rotate during T3 to T6; open the soft keyboard and check that the tools bar and the current clue remain reachable; set the Android font size and display size to large and to the largest, and repeat T3, T5 and T7 briefly.

Expected: TalkBack focus is not lost on rotation; nothing important is covered or unreachable while the keyboard is open (D6); at larger sizes the page stays usable without horizontal scrolling of the page and without controls disappearing.

## 5. Risks

| # | Risk | Likelihood | Impact | Plan response |
|---|---|---|---|---|
| R1 | Cells cannot be selected by TalkBack double tap (D1) | unknown, plausible | High for the grid path | T9; rule R3; the word path is the designed alternative |
| R2 | Live regions and the selection announcement talk over each other or repeat (D4, D5) | medium | Medium to High: typing becomes unusable | T5 and T10; record what is spoken and how long |
| R3 | The automatic move after completion cuts the announcement (D8) | medium | Medium (the success message is lost; WCAG 2.2.1) | T7 |
| R4 | The native confirmation dialog or the tools bar interferes with an open composition (D7) | low to medium | Medium | T6 |
| R5 | Spoken row and column positions are wrong (D10) | medium | Low to Medium | T9 |
| R6 | The soft keyboard covers the tools bar or breaks swipe order (D6) | medium | Medium | T12 |
| R7 | The tester cannot finish a puzzle independently | unknown | High: the main acceptance question | T3 to T8 pass criteria |
| R8 | The tester is an accessibility-trained engineer, not a daily TalkBack user, so real use is only approximated (PM decision) | certain | Medium: weaker evidence | stated in the report; the outcome is read with that limit |
| R9 | The environment is not representative (HTTP LAN, other keyboard, other TalkBack version) | medium | Medium | environment recorded; dry run kept separate from acceptance |
| R10 | Findings need code changes, which are not allowed here | certain if any | scope | findings go to the PM; no fix is made inside this plan |
| R11 | Test data on the pilot project (the hosted students may include real ones) | by plan | High if mishandled | only `SMOKE` accounts, the flag window and cleanup of `m2/09` §9 and `m2/18`; no real student, no reading of real data |

## 6. Pass and fail criteria

### 6.1 Severity

| Level | Definition |
|---|---|
| **Blocker** | the tester cannot start, play, submit or finish a puzzle on the supported path without sighted help; focus is trapped; data is lost; a task that must be done has no spoken or operable form |
| **Major** | the task can be finished but with significant extra effort or confusion; important information is silent, wrong or cut off (cell content not spoken, a failed save or a check result not announced, the completion message lost) |
| **Minor** | verbose or duplicated speech, awkward wording, order that is odd but workable |

### 6.2 Rules

- **R1. Supported path.** The path that must work completely is the **word path**: sign in, list, open, choose a word from the clue list, type in "글자 쓰기" or "낱말로 입력", use tools, submit, result (T1 to T8).
- **R2. Pass per scenario.** A scenario passes when its expected behaviour is met with no Blocker and no Major. A scenario with only Minor findings passes and the findings are logged.
- **R3. Grid path (PM decision, 2026-10-22).** The release criterion is that **a TalkBack user can complete the crossword through the clue-list path**. Direct interaction with the grid cells is **desirable but not required**. T9 is run and its result recorded (including whether a double tap selects a cell, D1). **A grid failure with a successful clue-list completion is a Major issue, not a Blocker.** The Major is **not excluded automatically** from the count of Majors or from the outcome of §6.3: it counts like any other Major, and **the PM decides, after seeing the actual result, whether it is accepted** (PM correction, 2026-10-22). Being a Major and not a Blocker means only that a successful clue-list completion keeps the plan out of FAIL. If the grid path breaks something on the clue-list path (for example a selection that steals focus), that is judged under the normal severities.
- **R4. Retest.** A fix is retested on the same scenario, device and settings and the report keeps both results.

### 6.3 Outcome

| Outcome | Condition |
|---|---|
| **PASS** | the tester completes a puzzle through the **clue-list path** (PM criterion) and all P1 scenarios (T1 to T8) pass; no Blocker anywhere; P2 scenarios other than T9 have no Blocker and at most two Majors, each with a mitigation the PM accepts in writing; a grid failure found in T9 is a Major (not a Blocker, R3) that **counts** toward the Major limit and is accepted or not by the PM after seeing the result |
| **CONDITIONAL PASS** | no Blocker; P1 scenarios pass except for Majors that the PM accepts in writing with a dated mitigation (for example a fix scheduled and a retest); the release condition C-2 of `m2/11` is then met only with that acceptance |
| **FAIL** | any Blocker, or a P1 scenario that does not pass, or the tester could not complete a puzzle on the word path |

Condition C-2 of `m2/11` ("TalkBack session on the tablet, result recorded") is satisfied by a **recorded** session with PASS or CONDITIONAL PASS; a FAIL is also a recorded result and blocks the release gate it belongs to until fixed and retested.

## 7. Evidence requirements

| # | Evidence | Format |
|---|---|---|
| E1 | **Environment sheet:** date, place, tester (daily TalkBack user, or engineer) and observer, device model, Android and TalkBack versions, Chrome version, keyboard app, TalkBack settings and typing mode, language, orientation, font and display size, network, deployment address and the build it serves (commit) | one filled form per session |
| E2 | **Scenario sheet:** for each of T1 to T12: pass, fail or not applicable; severity of each finding; the **words actually spoken** for the key announcements (selection, check result, save state, error, completion), copied or paraphrased with "verbatim" marked; what the tester did to recover from a problem | one table per session |
| E3 | **Recording:** a screen recording of T3 to T9 with TalkBack on. Phone and tablet recorders may not capture TalkBack speech; if the device offers TalkBack's developer option to **display speech output** as text, it is switched on so that speech appears in the recording. Whether this option is available is not verified here | video files kept by the owner, listed in the report |
| E4 | **Screenshots** of each failure state (and of any visual state that contradicts what was spoken) | image files |
| E5 | **Typing trace** for T5 where useful: the IME recording of `m2/09` §5 (`?imetrace=1`, test accounts only), to separate a TalkBack interference from an IME fault | JSON from the tablet, kept as in 09 |
| E6 | **Findings list:** id, scenario, severity, steps to reproduce, what was spoken, what was expected, device and settings, screenshot or time in the recording | one table |
| E7 | **Hosted data handling:** the approvals referenced, the flag window (start and end), and the cleanup counts returned to the baseline (`m2/09` §9.6 and §9.7) | text and query output |
| E8 | **Decision record:** the outcome of §6.3, the accepted Majors with their mitigation and date, and the PM's name | one page |

Evidence contains no real student data. Recordings and traces made with test accounts are stored by the owner and deleted when the PM decides, and are not committed to the repository.

## 8. Procedure and approvals

| Step | What | Who |
|---|---|---|
| 0 | Optional dry run of T3 to T8 on a local LAN build to find obvious problems early; findings are logged but do not count as acceptance | engineering with a TalkBack user |
| 1 | Preconditions: a database-connected deployment, the flag window, the `SMOKE` student and puzzles (`m2/09` §9, `m2/18` §2 approvals) | PM, Vercel owner, Ops |
| 2 | Brief the tester (what the app is, no teaching of the app; the task list T1 to T12; think aloud; say when stuck) | observer |
| 3 | Run T1 to T12 in portrait, then T3 to T9 again in landscape (smoke) | tester, observer |
| 4 | Fill E1 to E6; log findings with severity | observer |
| 5 | Cleanup and counts back to the baseline; switch the flag off (E7) | Ops |
| 6 | Decide the outcome of §6.3 and record it (E8) | PM |
| 7 | Findings with code impact are handed to the PM for scheduling; no fix is made during the session | PM |

Nothing in this plan authorises creating test data, switching the flag or deploying: those need the explicit approvals named above.

## 9. Open points for the PM

1. Who observes (a person other than the tester). The tester is decided (§10).
2. **Samsung Internet** with TalkBack: out of scope unless the PM asks.
3. If a finding needs code, the plan only records it: the fix, its schedule and the retest are a separate decision.

## 10. PM decisions (2026-10-22)

| # | Question | Decision |
|---|---|---|
| 1 | Who is the tester? | **An accessibility-trained engineer is preferred**; real TalkBack users are welcome but not required for the release gate. The weaker evidence of an engineer is stated in the report (R8) |
| 2 | Keyboard | **Samsung Keyboard is required**; **Gboard is optional** (an extra run if time allows) |
| 3 | Release criterion and the grid path | **If a TalkBack user can complete the crossword through the clue-list path, it passes.** Direct grid interaction is desirable, not required. **A grid failure with a successful clue-list completion is a Major issue, not a Blocker** (rule R3). The Major is **not excluded automatically** from the Major count or the final outcome; the PM decides whether to accept it after seeing the actual result (correction of 2026-10-22) |
| 4 | When | **After the Galaxy Tab validation readiness and after the database-connected deployment readiness** |
| 5 | Where it sits | Phase 7 of the integrated plan [21](21-hosted-acceptance-and-galaxy-tab-validation-plan.md) |
