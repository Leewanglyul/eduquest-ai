# 11. Student Play: release readiness audit

Status: **audit result, 2026-10-20, approved by the PM the same day. Verdict: NO-GO.** Code, DB and flags were not changed. Everything below is read from code, tests, the local stack and read-only queries against the hosted project. What was not observed is marked "not verified".

Inputs: [07](07-m2-2-4-student-play-plan.md), [08](08-m2-2-4a-student-play-foundation-plan.md), [08 hosted readiness](08-governance-14-student-play-hosted-readiness.md), [09 device validation](09-g5-device-validation.md), [10 override review](10-teacher-override-review.md), [pilot/14](../pilot/14-crossword-attempts-governance-draft.md), [product/01](../product/01-student-learning-profile.md).

## 0. Verdict

**NO-GO for real students.** The code and the data layer are in good shape. The release is blocked by items that are not engineering work (governance sign-off, real-device runs) and by one engineering gap found in this audit (the feature flag does not cover the API routes, §2). A **CONDITIONAL GO** for a first supervised pilot class is reachable when the conditions in §10 are met.

| Area | Result |
|---|---|
| 1 User flow | OK in code and tests; hosted flow never run end to end |
| 2 Feature flag | **Gap**: pages gated, API routes not |
| 3 Permissions (RLS) | OK |
| 4 Real-name exposure | OK (no path found) |
| 5 Teacher review link | **Missing** (teachers cannot see attempts) |
| 6 Learning profile link | OK as groundwork, nothing built |
| 7 Mobile layout | OK on PC emulation; Galaxy Tab not verified |
| 8 Accessibility | OK for axe; TalkBack not verified |
| 9 Release risk | see §9 and §10 |

## 1. User flow

`/student` (link shown only when the flag is on) → `/student/crosswords` (list, ordered by a fixed rule, no ranking) → `/student/crosswords/[assignmentId]` (play; first visit creates the attempt, later visits resume) → check / reveal / 초성 / submit via six route handlers → completion moment → `/student/crosswords/[assignmentId]/result` ("next puzzle" by the oldest-open rule).

- Autosave: 2 s debounce, also on blur, hide and `pagehide`; patches merge on the server, a second device cannot erase cells; check and submit carry `baseRevision` and answer `STALE` when another device moved on. Saved / saving / offline are shown as text with an icon.
- Closed or finished attempts are read-only and redirect to the result. A student cannot restart (no practice mode, decision E.5).
- Evidence: vitest 37 files / 716 tests on the local stack (flow, services including the shared-attempt shape, save queue, IME controller, static guards); pgTAP 14 files / 559 tests; axe clean at 360, 800 and 1280 px (PC browser).
- **Not verified:** the flow on the **hosted** project (only the erasure smoke test ran there; no puzzle was published or played on hosted), and any run on a Galaxy Tab.

## 2. Feature flag usage

`isCrosswordPlayEnabled()` (`src/lib/flags.ts`): `true` only if `CROSSWORD_PLAY_ENABLED=true`, or unset against a local Supabase host. It is called in four places: the student home link, the list page, the play page and the result page (each ends in `notFound()` when off).

**Finding F-1 (engineering gap, must fix before release): the six API route handlers (`.../api/state|save|check|reveal|chosung|submit`) and `playRoute` do not call the flag.** A signed-in student who knows an assignment id could call them on hosted with the flag off. Today this has no effect because hosted has no published puzzle or assignment, but a teacher can publish one at any time, and then the "feature is off" statement would be true for the screens only. The routes still enforce session, same-origin, enrollment and assignment state, so this is a gate gap, not an authorization hole. Fix: check the flag in `playRoute` (one place), with a test that every route returns 404 when it is off. Not done here (audit only).

Other points: the flag is read at request time (`force-dynamic` pages), so changing it needs only an environment change and a redeploy of the setting. It is OFF on hosted today (unset), and ON automatically for any `127.0.0.1` / `localhost` stack, which is intended and noted in the code.

## 3. Permissions (RLS)

Read from the hosted project after the 2026-10-19 push:

- `crossword_attempts`, `crossword_attempt_members`, `crossword_attempt_events`: RLS on, **no policies**, `SELECT` revoked from `anon` and `authenticated`. A student's own session cannot read even their own row; all student access goes through server code with the service role.
- The play functions (`fn_crossword_play_*`) are not executable by `anon` or `authenticated`. Three trigger functions of the earlier migrations (`fn_crossword_puzzles_immutable`, `fn_crossword_set_root`, `fn_crossword_words_immutable`) show `EXECUTE` for these roles; trigger functions cannot be called as plain functions and this matches the earlier M2-2.2 migrations. Low, informational.
- Puzzle, word, assignment, set and entry tables have RLS with staff-only policies (owner, classroom owner, co-teacher). I read the start of each policy (the output was cut); no policy mentions students. Not verified by a live student-JWT query on hosted. Local pgTAP (doc 07 G.3) tests the student-JWT access matrix.
- `crossword_words` holds the answers. Students get only structure and their own letters; the payload builder selects no `answer` column, a static guard and a flow test check that no answer string reaches any reply.
- The student erasure path works with attempts (`20261019000004`, tested locally and on hosted).

## 4. Real-name exposure

No path found.

- The attempt row names no student; ownership is only in the member table.
- Student-facing payloads contain: puzzle title, clues, word structure, the student's own cells, limits, classroom name, level, counts. No other student's data and no teacher names. The only name on the student screens is the student's own `display_name` on `/student` ("님, 환영합니다").
- Events record the word number and direction, never letters or cells; a CHECK on `detail` enforces it.
- No ranking, comparison or other-student text is in the screens (a rendering test asserts forbidden words are absent).
- Future risk, not current: anything that adds shared or team views (M2-3) must use aliases per the PM decision; doc 06 §12 covers it.

## 5. Teacher review link

**Missing.** Nothing in `src/app/teacher` or the review service reads attempts. Teachers can create, review, publish and close puzzles, but cannot see whether a student started, finished, used tools, or is stuck. The plan puts this in M2-2.5 (results) with a separate teacher policy and an amendment of a hardening test (doc 07 §0.3 and G.3). For a real class this means a teacher would hand out puzzles blind. Either accept that for a first supervised class (teacher watches the room), or schedule M2-2.5 before release. This needs a PM decision (§10, condition C-6). Teacher override (doc 10) is also not built.

## 6. Learning profile link

The data groundwork matches product note 01 §8 and doc 07 B: per-word hint events (number and direction only), counts of checks, reveals and 초성, active time, a `wordsCompleted` count on the completed event (server-only), one attempt per student and assignment. Nothing reads these yet (no profile, history or achievements), as planned. Open: Q3 of pilot/14 (entry and autosave events) stays "not now". No blocker for release; the profile can be built later on the same rows.

## 7. Mobile layout

- Verified on a PC browser at 360 × 740, 800 × 1280 and 1280 × 800: no page-level horizontal scroll, tool buttons 48 px, cells 44 px minimum, inputs 16 px, grid in a named scroll region, clues beside the grid from 1024 px.
- Fixed in this work (`f933b3a`): at 360 px the three-row tools bar covered the input fields; scroll margin added.
- The play page sets `interactiveWidget: "resizes-content"`, so the soft keyboard shrinks the page and the pinned tools bar stays above it (supported by Chrome 108+). This corrects the earlier worry in [09](09-g5-device-validation.md) §8 that the bar could hide behind the keyboard; it is now a design assumption that the device run must confirm (item C6).
- **Not verified on a real Galaxy Tab:** soft-keyboard height in landscape (the visible area can be about half the screen), touch targets, orientation change during composition, the 15 × 15 case with a keyboard open. These are the checks that matter most for the students' real device.

## 8. Accessibility

- axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA plus best practice): 0 violations on the play page (three sizes), the list and the home.
- Structure: `role="grid"` with rows and named cells ("가로 1번, 2글자, 첫 번째 칸, 입력됨, 사"), clue lists as real lists with `aria-current`, polite live regions for save state, check results and selection, a non-grid alternative ("낱말로 입력"), no time limits, completion moment off under `prefers-reduced-motion`, 44 px+ targets, `lang="ko"`.
- Known soft spots: the reveal confirmation uses `window.confirm` (works, but a native dialog during a composition is unproven on the tablet); cell number labels are 10 px and check marks 11 px (decorative, `aria-hidden`, but small for low vision).
- **Not verified:** any screen reader (TalkBack on the tablet, NVDA on Windows), keyboard-only run on hardware, 200 % text zoom, Samsung Internet. The doc 07 D.5 table is therefore a design target, not a measured result.

## 9. Release risks

| # | Risk | Likelihood | Impact | Status |
|---|---|---|---|---|
| R1 | Korean IME input fails on Galaxy Tab + Chrome (SC1-SC5) | unknown, largest risk per doc 04 §9 | High: the core interaction | No real-device data; Windows Chrome traces pass, Edge had failures that led to the v2 controller. Fallback exists (word entry) |
| R2 | Governance: `pilot/12` revision not final and `pilot/13` unresolved. Q4 (guardian notice) is, by PM judgment of 2026-10-21, covered by the school's existing consent procedure and is not a separate blocker (confirmation by the school's data-protection contact pending) | certain until done | High: legal gate (pilot/14 §7) | Open |
| R3 | API routes ignore the flag (F-1) | certain | Medium | Open, small fix |
| R4 | Teacher has no view of attempts (§5) | certain | Medium: blind classroom use | Needs PM decision |
| R5 | Hosted flow never run end to end (publish, play, resume, submit, erase) | certain | Medium | Run with test accounts before release |
| R6 | Tablet soft keyboard hides content or breaks the tools bar | medium | Medium | Device run C2, C6 |
| R7 | School network blocks or slows the hosted site; offline recovery | unknown | Medium | Hosted check at the school, items E2-E6 |
| R8 | Screen reader users cannot use the grid | unknown | Medium | TalkBack run; word entry is the fallback path |
| R9 | A student locks in a wrong completed state; no retry | by design | Low-Medium | Known (E.5), teacher reset is M2-2.5 |
| R10 | Teacher override missing (checks/reveals fixed by level) | certain | Low | Decision recorded in doc 10, out of scope |
| R11 | Pilot data retention / backups for new tables | low | Medium | Covered by pilot/14 §4 once signed |

## 10. Conditions for a CONDITIONAL GO (first supervised class)

Must be done (blockers):

- **C-1** Galaxy Tab + Chrome run of doc 09 A-F on the **hosted** deployment, with a written SC6 verdict and no SC1-SC5 failure (otherwise word entry becomes the primary input first).
- **C-2** TalkBack session on the tablet, result recorded.
- **C-3** `pilot/14` folded into `pilot/12` (final revision) and **`pilot/13` resolved** by the PM and school (a signed copy, if any, is a school operations record); the school's data-protection contact confirms that the existing consent procedure covers the play data (PM judgment on Q4).
- **C-4** Flag gap F-1 fixed and tested (a code change, to be scheduled and approved separately).
- **C-5** One full hosted run with test accounts: publish a test puzzle, play and resume from two devices, submit, erase the student. Test data removed afterwards.
- **C-6** PM decision on teacher visibility: accept "no results screen" for the first class, or schedule M2-2.5 first.

Should be done:

- Galaxy Tab + Samsung Internet (secondary), Windows Chrome and Edge runs of doc 09.
- Confirm on the tablet that `window.confirm` for reveals does not disturb an open composition.
- A short teacher note for the pilot class (how to close an assignment; what students can and cannot do).

When C-1 to C-6 are met, the verdict becomes **CONDITIONAL GO** for one supervised class with `CROSSWORD_PLAY_ENABLED=true` set on purpose for that deployment, and a **GO** for wider use only after a pilot week with no input failures.

## 11. What stays unchanged

`CROSSWORD_PLAY_ENABLED` stays unset (OFF) on hosted. No implementation starts from this audit; F-1 and the other items need separate approval.

## 12. Blocker register (PM decisions, 2026-10-20)

| ID | Item | Class | State |
|---|---|---|---|
| **F-1** | Feature flag controls the screens but not the six API routes | **MEDIUM**, registered as a **Student Play release blocker** | Open. A design proposal is written before any implementation: [12-f1-feature-flag-api-gating-design.md](12-f1-feature-flag-api-gating-design.md). No code change until it is approved |
| **TV-1** | Teacher visibility: teachers cannot see attempts (§5, condition C-6) | Managed as its own item, **not** folded into F-1 | Open. Needs a PM decision (accept for the first supervised class, or schedule M2-2.5 first) |

No code, DB or feature flag change comes from this audit.

### 12.1 Additions (PM, 2026-10-20)

- **Notation:** documents are named with their folder: `pilot/12`, `pilot/13` (data governance policy and its sign-off) and `m2/12`, `m2/13` (F-1 design, teacher visibility review).
- **F-1 stays OPEN.** Whether the gap is reproducible on the deployed app is **not verified**: the audit read the code only (no flag check in the six route handlers), and the deployment's environment value of `CROSSWORD_PLAY_ENABLED` and the deployed version were not checked.
- **Interim control:** until F-1 is implemented, **no crossword puzzle is published on the hosted project.** This is an operating rule, not a code change.
- **Order:** the Galaxy Tab and TalkBack runs happen **after** F-1. A "Hosted Acceptance" section for [09](09-g5-device-validation.md) (test classroom and students with the `SMOKE` prefix, cleanup, pass criteria) may be considered before those runs; it is not written yet.
- **OP-1 (operating risk): untracked files in the repository root** (`accounts.txt`, `big.txt`, `first30.txt`, `s9-a.csv`, `s9-b.csv`, `signin-load.mjs`). They may contain personal data of pilot students or accounts; their content has **not** been inspected. Risk: an accidental `git add -A` and push. Until reviewed by their owner: do not commit them, move them out of the repository or ignore them. No file of this list has ever been committed (commits so far named files one by one).
