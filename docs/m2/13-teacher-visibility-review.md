# 13. TV-1: teacher visibility of Student Play (analysis)

Status: **APPROVED by the PM, 2026-10-20 (decisions in §8).** Documents only: no code, DB, migration or feature-flag change. Item TV-1 of [11](11-student-play-release-readiness-audit.md) §12 (managed separately from F-1). Sources: migrations `20261019000002` and `…03`, `src/features/crossword/review/service.ts`, the teacher routes under `src/app/teacher`, [07](07-m2-2-4-student-play-plan.md) §0.3, B.1, G.3, [pilot/14](../pilot/14-crossword-attempts-governance-draft.md) §3 and Q5, [product/01](../product/01-student-learning-profile.md).

Context: schema applied on hosted, delete flow verified, F-1 designed and not implemented, `CROSSWORD_PLAY_ENABLED` OFF.

## 1. Current state

### 1.1 What a teacher can see today

- **Puzzles:** list and detail of their own puzzles (title, level, word count, version history, readiness, answers and clues), through the teacher review screens.
- **Assignments of a puzzle:** per classroom: classroom name, `open` or `closed`, opens-at and closes-at (the `assignments` shape of `review/service.ts`). The list view also carries `open_assignments` (a count of open assignments per puzzle).
- **Roster:** classrooms and their students (names, student numbers, accounts) on the classroom screens.
- **Actions:** publish, add classrooms, close an assignment, archive.

### 1.2 What a teacher cannot see

- Whether any student **started**, is **in progress**, or **completed** an assignment.
- Progress (how many cells are filled), last activity, time spent.
- Whether a student used checks, reveals or 초성, or submitted wrong answers.
- Anything about an individual attempt. There is no teacher screen, no teacher service function and no teacher read policy: the three attempt tables have RLS on with **no policy** and client privileges revoked, so a teacher's own session cannot read them either (pilot/14 §3: teachers and admins have "none yet"; results are M2-2.5).
- An existing hardening test (`crossword-hardening.test.ts:75`) pins that teacher code does not touch `student_id` or `crossword_attempts`; M2-2.5 was planned to amend it deliberately (doc 07 §0.3 #12).

### 1.3 What is stored (all of it unreadable by teachers today)

| Table | Content relevant to a teacher |
|---|---|
| `crossword_attempts` | one row per student and assignment: `status` (`in_progress` / `completed`), `cells` (the student's typed letters), `prefill_keys`, `revealed_keys`, counters `checks_used`, `reveals_used`, `chosung_used`, `submits_used`, `last_wrong_submit_at`, `active_seconds`, `revision`, `started_at`, `last_saved_at`, `updated_at`, `completed_at` |
| `crossword_attempt_members` | who the attempt belongs to (`student_id`); one row today, more for a future shared attempt |
| `crossword_attempt_events` | `check`, `chosung`, `reveal`, `submit_wrong`, `completed` (and the reserved `entry`) with `detail` limited to scope and word number/direction; never letters or cells |

So the data for the Must items below **already exists**. Nothing needs to be collected; it needs a governed read path. Not stored: a per-word correctness record (deliberately; doc 07 and product note 01 §3), so a teacher can learn "which words needed a tool" from events but not "which words were wrong".

## 2. Gap: what a teacher must know to run a class

| # | Question during or after a lesson | Answerable today? | Data source |
|---|---|---|---|
| Q-a | Who has **started**? | No | attempt exists |
| Q-b | Who has **not started** (no attempt)? | No | enrolled students minus members |
| Q-c | Who has **completed**? | No | `status`, `completed_at` |
| Q-d | How far along is each student (**progress**)? | No | filled cells (from `cells` and `given`) of the puzzle's total cells |
| Q-e | Has the student **submitted** and been told it is wrong? | No | `submits_used`, `last_wrong_submit_at`, `submit_wrong` events |
| Q-f | Did the student **use help** (checks, reveals, 초성), and how much? | No | counters, events |
| Q-g | Which student seems **stuck** or inactive (no saves for a while)? | No | `last_saved_at` |
| Q-h | Did the student's work **save** (a student says "my progress is gone")? | No | `last_saved_at`, filled count, `revision` |
| Q-i | How long did students **spend**? | No | `active_seconds` |
| Q-j | Which words were hard for the class? | No | events by word, only help use, not correctness |

## 3. MVP for the first supervised pilot class

Principles carried over from the decisions already made: teachers may see real names; students never see each other; no score, rank or comparison wording or ordering (CE-11, product note 01 §6); learning visibility for the student is not reduced; no new data is collected (§1.3); the teacher scope is classroom owner and co-teachers (pilot/14 Q5, doc 04 §5.5).

### Must (needed to run and to judge the pilot)

| ID | Item | Why |
|---|---|---|
| M-1 | Per assignment (puzzle × classroom): a **roster table** with one row per enrolled student: name, student number, state **not started / in progress / completed** | Q-a, Q-b, Q-c: the minimum to know who is done |
| M-2 | **Progress** per student as filled / total cells (a count, no letters) | Q-d, and Q-h (a lost-progress complaint can be checked) |
| M-3 | **Last activity** time (`last_saved_at`) and **completed** time | Q-g, Q-h |
| M-4 | A **count of help used** per student (checks, reveals, 초성) in neutral wording ("도구를 활용했어요"), the same style as the student's result screen | Q-f; the pilot also needs to see whether tools are used |
| M-5 | **Wrong submits** shown as a count (no penalty wording) | Q-e |
| M-6 | Access limited to the classroom owner and co-teachers; read-only; no letters, no answers | pilot/14 Q5 and the no-answers rule |
| M-7 | The list sorted by **roster order or name**, never by progress, help or time | CE-11, no ranking |

### Should (useful for the pilot, small additions)

| ID | Item |
|---|---|
| S-1 | A one-line summary per assignment ("n of m started, n completed") |
| S-2 | Active time per student, in minutes |
| S-3 | An "inactive for a while" marker computed from last activity (informational, not a flag on the student) |
| S-4 | A refresh control and a visible "as of" time (the data is not live) |
| S-5 | Per-student view of which **words** had help used (word number and direction, from events) |

### Could (later)

| ID | Item |
|---|---|
| C-1 | Class-level view of words that needed help most (Q-j) |
| C-2 | Seeing the student's typed grid (their work product, needs a governance decision and a wording review) |
| C-3 | History across puzzles and growth (Student Learning Profile) |
| C-4 | Teacher reset of an attempt, close or reopen per student (M2-2.5 and doc 10 items) |
| C-5 | Export (CSV), notifications, live updates |
| C-6 | Teacher override of limits ([10](10-teacher-override-review.md), out of current scope) |

## 4. Operating risks without visibility

If a class starts Student Play with no teacher view:

1. **Blind classroom.** The teacher cannot tell who has finished, so the lesson end, hand-in and any follow-up rely on walking around the room and looking at tablets.
2. **No support evidence.** "I lost my work" or "it says I'm not done" cannot be checked. The teacher cannot tell a save problem from a student who did not finish. The first pilot week would produce complaints without data.
3. **No way to judge the pilot.** One purpose of the pilot is to validate Student Play (input on tablets, saving, resuming). With no read path, the only evidence is anecdotes and developer database queries, which means developers reading student data outside any teacher process (a governance and privacy concern: pilot/14 §3 lists operations staff as the only access).
4. **Operational dependence on developers.** Any question about a student's progress becomes a request to someone with database access, which scales badly and widens who sees student data.
5. **Silent failure.** A student stuck at an input problem on the Galaxy Tab (the main technical risk, R1 of [11](11-student-play-release-readiness-audit.md)) stays invisible unless the teacher happens to look at that tablet.
6. **Stale attempts.** Without visibility and without a teacher reset (C-4), a student locked in a wrong completed state cannot be recognised or helped (known, E.5).
7. **Trust and consent.** A teacher using a tool where students' data is collected but is not shown to them may be asked by guardians what is kept; M-1 to M-5 are the very items doc 14 §5 already tells students are stored. Showing them to the teacher, within the stated purposes, is consistent with that notice only if pilot/14 §3 is amended first (§6 below).

Mitigations that need no build, for a decision of "go without visibility": the teacher stays in the room and checks the tablets, a developer provides a one-off read-only status listing on request through a documented, logged procedure, and the pilot is limited to one class. These reduce risk 1 and 5 but not 2 to 4.

## 5. Implementation notes for later (not a design, no work started)

- **Data:** the Must items need no new tables or collected data. They need a read path: either a service-role function that checks the actor is the classroom owner or a co-teacher (the pattern already used by the teacher functions), or a reviewed RLS read policy and view. Which one is a later design choice; the first needs no change to RLS on the attempt tables.
- **DB / hosted:** any new function or policy is a migration and therefore follows "impact report, PM go, then push" (2026-10-20 rule).
- **Governance:** pilot/14 §3 says teachers have no access; Q5 is still "recommended, not answered". An addition to §3 and a doc 12 revision (and doc 13 re-sign if the PM requires it for this scope) come before any real use.
- **Code:** teacher-side code that reads attempts will amend the hardening test pinned in §1.2. Student-side files are not touched.
- **UI:** one read-only table on the assignment of a puzzle, in the teacher area on desktop. No change on the Galaxy Tab student screens.
- **Size (qualitative):** Must items are small to medium (one read function, one table component, tests). It is considerably smaller than the full M2-2.5 results work.

## 6. Recommendation

**B. Implement the minimum visibility, then run the pilot.**

Reasoning:

- Visibility is not optional for a pilot whose goal is to validate Student Play. Without it, risks 2 to 4 of §4 make the pilot hard to run and hard to judge, and they push student-data reads onto developers.
- The Must set (M-1 to M-7) uses data that is already stored, reveals no letters, and is small. It does not require M2-2.5 (full results, reset, history).
- A (go without) is acceptable only as a short, explicitly supervised try-out where the teacher is in the room and the result is a technical check, not a classroom pilot. It should not be the plan for the first real class.
- C (NO-GO until visibility) is not needed as a separate gate: B already lists visibility as a condition. This analysis changes C-6 of [11](11-student-play-release-readiness-audit.md) from "accept or schedule" to "schedule the minimum, M-1 to M-7".

If B is chosen: keep it narrowly scoped to the Must items, do the governance addition (pilot/14 §3 and Q5) first, and keep it independent from F-1 (the flag fix), from teacher overrides ([10](10-teacher-override-review.md)), and from the Galaxy Tab and TalkBack runs (C-1, C-2).

## 7. Questions for the PM

1. Choose A, B or C. (Recommendation: B.)
2. Confirm the teacher scope: classroom owner and co-teachers only (pilot/14 Q5).
3. Confirm that the Must list shows **no letters** (counts only), with the student's grid kept for a later decision (C-2).
4. Is the progress count (filled / total) acceptable to show a teacher under the stated purposes of pilot/14 §2, or does it need a wording review first?
5. Does the governance addition for teacher access require doc 13 to be re-signed, or can it be covered by the same re-signature already required for the attempt data?

## 8. PM decisions (2026-10-20)

1. **Option B** adopted: implement the minimum visibility, then run the pilot.
2. Teacher access scope: the classroom **owner** and **co-teachers**.
3. Typed letters, answers and the student's grid are **not shown**.
4. The progress count (filled / total) is approved as a collection and display purpose.
5. **Doc 12 must be amended** (teacher access to attempt data, progress purpose).
6. **Doc 13 (pilot) must be re-signed.**
7. **TV-1 stays a Student Play release blocker.**

Next step: the minimal implementation design, [14-tv1-teacher-visibility-design.md](14-tv1-teacher-visibility-design.md). Implementation, DB and migrations have not started.
