# Operational UX Principles v1.0

Status: **APPROVED by the PM (2026-11-02)**, OX-1 to OX-13. A specification / governance approval: it does not approve
unresolved future features (the open points of section 3 stay open). Documentation only: no code, schema,
flag or deployment change. **Not a UI specification:** this document sets operational constraints and design
principles for real classroom use. Feature packages and UI designs must follow it and show how each validation
criterion is met.

Must comply with: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) (**CON**) ·
[Collaboration Governance Package v1.2](eduquest-collaboration-governance-package-v1.md) (**PKG**) ·
[Teacher Dashboard and Classroom Operations v1.2](teacher-dashboard-and-classroom-operations-v1.md) (**OPS**) ·
[Teacher Package Specification v1.0](teacher-package-specification-v1.md) (**TPS**).
Referenced by: [Design Vision v1](design-vision-v1.md) (**DV**), which leaves classroom operation and team competition
rules to this document.

---

## 1. Purpose

EduQuest runs inside a **teacher-operated classroom** (PKG G-2). A lesson is 45 to 50 minutes; EduQuest is one
activity in it, used **intermittently** (some lessons, not every lesson), often after days or weeks without use.

That makes operational overhead the main risk to adoption:

1. **Every minute of setup is a minute of learning lost.** Time spent on sign-in, finding the activity or fixing teams
   comes out of the lesson, not out of the product.
2. **The teacher runs everything at once.** The same person supervises 20 to 30 students, answers questions and
   operates the platform; any step that needs attention competes with teaching.
3. **Intermittent use means nothing is remembered.** Passwords, menus and rules learned last month are forgotten. The
   flow must work for someone who last used it weeks ago.
4. **Failures are public.** A student who cannot get in, or a team that cannot start, stalls the class and is visible
   to everyone. Students are protected (CON rule 1): an operational failure must not single a student out.
5. **Teachers decide whether EduQuest is used again.** A lesson that loses ten minutes to setup is not repeated,
   however good the learning design is.

Operations are designed for the busiest moment of a real lesson, not for a calm demo. What can be prepared before
class must be possible before class; what remains in class must be short, predictable and recoverable without
stopping the room.

---

## 2. Principles

| # | Principle |
|---|---|
| OX-1 | Five-Minute Rule (first use 10, repeat use 5) |
| OX-2 | Three-Step Launch |
| OX-3 | Peer First |
| OX-4 | Classroom Before Analytics |
| OX-5 | Recognition Without Exposure |
| OX-6 | Risk-Based Review |
| OX-7 | Teacher Override |
| OX-8 | Intermittent Use |
| OX-9 | Course Room Continuity |
| OX-10 | Teacher Mobility |
| OX-11 | Graceful Degradation |
| OX-12 | Projection Safety |
| OX-13 | Minimum Data |

Each principle has validation criteria (PM decision 7). Criteria marked **classroom trial** are checked in a timed run
with a real or rehearsal class; **review** criteria are checked on the feature package or UI design before
implementation; **test** criteria are automated where possible.

---

## OX-1. Five-Minute Rule

**Targets**

| Situation | Target |
|---|---|
| **First use** (the teacher's first EduQuest session with this Course Room) | **10 minutes** |
| **Repeat use** | **5 minutes** |

**Measurement:** from the **teacher's start declaration** until **every team has started** (a team has started when
its shared attempt has a first input). **Supporting metric:** at least 90 % of present students made a first input.
External device faults are logged separately and do not fail the run. Applies to every play mode (TPS section 4); in
Individual Check, each student counts as a team of one.
Preparation before the start declaration (TPS section 9, "Before class") is outside the measurement.

### Factors that threaten the rule

| # | Factor | Where it comes from today | Effect in class |
|---|---|---|---|
| F-1 | **Student sign-in:** username plus password per student; first sign-in forces a password change | built account model (TPS section 2) | the longest single step; typing on tablets, mixed Korean/English input; dominates first use |
| F-2 | **Forgotten passwords and lockouts** after failed attempts, with intermittent use | account lockout; password reissue by the teacher | one student takes the teacher's attention; repeated per student |
| F-3 | **Shared devices still signed in** as the previous student | shared tablets, mixed devices (PKG H.1) | wrong identity; work lands on another student's record (TPS QR-5) |
| F-4 | **No start action:** an assignment opens at a scheduled time | assignment opens-at (TPS OD-7) | "start declaration" has no counterpart in the product today |
| F-5 | **Finding the activity** among several assignments | student assignment list | students open the wrong puzzle or wait for directions |
| F-6 | **Teams formed in class** instead of before | team setup is a teacher task (TPS section 3) | the class waits while the teacher assigns |
| F-7 | **Absent or late students** change team sizes; under-3 teams; "팀 배정 대기" | P2 D-2, D-4 | team fixes during the measured time |
| F-8 | **Locks at start:** mode and team composition fixed after the first student starts | P1 lock; P2 D-3 | a mistake found late cannot be corrected without a new assignment |
| F-9 | **Network and device issues:** classroom Wi-Fi, tablet keyboards and IME | device validation (decision #6) | students stall individually |
| F-10 | **Feature not available:** play or team flag off for the environment | E-5 flags | the activity does not appear; the teacher cannot fix it in class |
| F-11 | **Teacher setup gaps:** co-teacher missing, roster out of date, puzzle not assigned | TPS sections 1, 2 | discovered only at the start |
| F-12 | **Explaining the rules** of a new mode | TPS sections 4, 6 | instruction time before anyone types; dominates first use |
| F-13 | **The teacher's own screen** must be opened and found in parallel | TPS section 7 | the teacher cannot see who is still not in |

### Constraints

1. Everything that can be prepared before class can be prepared before class (F-6, F-11).
2. A pre-start check, shown in Confirm Setup (OX-2), tells the teacher what will block the start (unassigned students, closed window, puzzle not
   assigned) before the declaration (F-4, F-7, F-11).
3. The teacher sees in one place which students have not made a first input, with no names on student screens (F-13).
4. A blocked student is recovered without stopping the class and without exposing that student (F-1 to F-3).
5. The rules of a mode are understandable from the screen in under a minute (F-12).

### Validation

| # | Criterion | Method |
|---|---|---|
| V1-1 | First use: every team started within 10 minutes of the start declaration | classroom trial, timed |
| V1-2 | Repeat use (a later session, same Course Room): every team started within 5 minutes | classroom trial, timed |
| V1-2a | Supporting: at least 90 % of present students made a first input within the target | classroom trial, timed |
| V1-2b | External device faults (outside EduQuest) are logged separately with the student count affected | classroom trial log |
| V1-3 | Each run records the time per step (sign-in, find activity, team join, first input) and every student who exceeded the target, with the cause (F-number) | classroom trial log |
| V1-4 | Every factor F-1 to F-13 that a feature package touches is named in it with its effect on the targets | review |
| V1-5 | The start declaration is a single, explicit teacher action whose time is recorded (needs TPS OD-7) | review, test |


---

## OX-2. Three-Step Launch

Default launch flow:

**Select Activity → Confirm Setup → Start**

| Step | Content |
|---|---|
| Select Activity | the assignment (puzzle × Course Room) prepared before class |
| Confirm Setup | mode, teams and signal settings at a glance; **automatic team formation appears here** as a proposal the teacher accepts or edits (TPS TF-8); blockers from the pre-start check (OX-1) |
| Start | the start declaration (OX-1 measurement starts here) |

Rules:
1. **Content review happens before class, outside the launch** (OX-6: puzzle review and publish are high-risk and never
   part of launch).
2. Automatic team formation appears inside Confirm Setup, not as a separate step.
3. The default launch needs **no more than three screen transitions**.
4. **Advanced settings stay outside the default flow** (limits, challenge settings, signal set details); the defaults
   come from the last session (OX-8).

Validation:

| # | Criterion | Method |
|---|---|---|
| V2-1 | The default launch is Select Activity → Confirm Setup → Start, with at most three screen transitions | review (count on the design), test (route sequence) |
| V2-2 | No content review or publish step is reachable inside the launch flow | review |
| V2-3 | An automatic team proposal is shown in Confirm Setup and saved only after the teacher accepts it | review, test |
| V2-4 | Every advanced setting has a default and can be skipped; the default launch never requires opening one | review |
| V2-5 | In a classroom trial, the teacher completes the launch without help, and the time from Select Activity to Start is recorded | classroom trial |

---

## OX-3. Peer First

When a student or team is stuck, help follows this order:

**Team attempt → Collaboration Signals → Teacher Escalation**

1. **Team attempt:** the team tries together on the shared grid, with its shared tools (check, 초성, reveal within the
   team budget, D-6) and Shared-Action Jigsaw actions (no hint budget, H-10).
2. **Collaboration signals:** teammates coordinate through structured signals (PKG H), anonymous and rate limited.
3. **Teacher escalation:** the team help request to the teacher (G2, D-9), a separate interaction type (H-8).

Constraints:
- The order is encouraged by the design (what is closest at hand), **never enforced**: escalation to the teacher is
  always reachable and never requires a prior signal or attempt count. Students are protected (CON rule 1).
- Escalation stays anonymous and team-level (G2).
- Where signals are switched off (Priority 2 not yet available, or the teacher disabled them), the order is team
  attempt → teacher escalation.

Validation:

| # | Criterion | Method |
|---|---|---|
| V3-1 | The team's shared tools and signals are reachable from the play screen without leaving the grid | review |
| V3-2 | Teacher escalation is reachable in one action at any time while the attempt is open; no precondition | review, test |
| V3-3 | Escalations identify the team only | test (help request has no student column) |
| V3-4 | In a classroom trial, the share of teams that resolved a block without escalating is recorded (team-level only) | classroom trial |

---

## OX-4. Classroom Before Analytics

During class the teacher's screen serves **running the room**; analysis comes after class.

| When | Shown |
|---|---|
| **Real-time** (during class) | teacher help calls · operationally blocked teams · missing / not-started students · time and teacher intervention controls · session status |
| **Post-class** | behaviour signals · collaboration statistics · growth analytics · progress and contribution detail |

Definitions (constraints for the feature packages):
- **Blocked team:** a team that cannot play for an operational reason: no member has joined, under-sized or with
  unassigned students waiting, a member locked out of sign-in, the assignment not open. The **team-level last-progress timestamp** may be shown
  next to a team (PKG I-2); no personal stuck time is stored or used to evaluate a student.
- **Current clue:** only as ephemeral live state, never stored or analysed, discarded after the session (PKG I-3).
- **Missing student:** an actively enrolled student with no first input in this session (TV-1 "not started").
  EduQuest does not know who is physically present; the teacher does.
- **Behaviour signals** (post-class) are limited to data already approved: tool-use counts, wrong-submit counts,
  team-level signal counts (H-11). No focus data, no personal stuck time (G1 as amended). No automated domination,
  follower or leadership metrics: the Student Behavior Model is for teacher observation (PKG I-1).

Validation:

| # | Criterion | Method |
|---|---|---|
| V4-1 | The live view shows the three real-time items without navigation | review |
| V4-2 | Post-class items do not appear on the live view | review |
| V4-3 | "Blocked team" is computed from operational states; the only timing data is the team-level last-progress timestamp; no per-student time | review, test |
| V4-5 | Current-clue state is never written to durable storage and is gone after the session | test |
| V4-4 | Every post-class item maps to an approved data category | review against `docs/pilot/12`, `13` |

---

## OX-5. Recognition Without Exposure

- **Individual comparison is prohibited.** No student is ranked, ordered or compared with another on any student or
  projected screen (CON rules 4, 5).
- **Teacher-configured team comparison is allowed** (PKG G-4): only when the teacher has chosen a mode that includes
  it, and only between teams.
- Recognition stays positive: participation and achievement messages never name a student who did not reach them
  (P3-D4).

Validation:

| # | Criterion | Method |
|---|---|---|
| V5-1 | No student-facing or projectable screen contains an individual ranking, ordering or comparison | review, test (response key lists) |
| V5-2 | Team comparison appears only when the teacher enabled it for that assignment; off by default | review, test |
| V5-3 | Team comparison never shows member names or per-student figures | review, test |
| V5-4 | Recognition wording is positive only; nothing is shown for a student who did not contribute | review |

Constitution rules 4 and 5 are interpreted accordingly (PKG I-9): team comparison is allowed under projection safety
(OX-12).

---

## OX-6. Risk-Based Review

Replaces "Trust Through Review". **The review a teacher must do before students see something scales with its
risk** (reading still to be confirmed, UX-1). The teacher is not asked to
review everything (operational overhead, OX-1); high-risk items are never skipped.

| Risk | Examples | Required review |
|---|---|---|
| High | newly generated or imported puzzle content, clues and answers | teacher review and publish before assignment (existing review and publish flow) |
| Medium | generated team proposals (random grouping) | teacher confirms before save (TPS TF-8) |
| Low | reusing an already published puzzle; choosing a signal set from approved lists (H-9) | no extra review |

Validation:

| # | Criterion | Method |
|---|---|---|
| V6-1 | Each teacher-facing item in a feature package is classified high, medium or low, with the reason | review |
| V6-2 | No high-risk item reaches students without a recorded teacher review | test |
| V6-3 | Low-risk items add no review step | review |

---

## OX-7. Teacher Override

During a session the teacher may:

| Override | Governance boundary |
|---|---|
| **Add time** | to the session or a team; recorded |
| **Skip a flawed clue** | the clue no longer counts for completion; recorded |
| **Accept an answer** | an answer the teacher judges correct counts as solved; recorded |
| **Add a late student** | to a team, also after start (P2 D-3) |
| **Reassign a student where governance permits** | only before the team has started; moving a student out of a started team stays refused (P2 D-3) |
| **Reset a student verification code** | the student's access information is replaced at once (OX-8) |

**Competition modes:** a clue skip or an answer acceptance applies **equally to every team** and is **recorded in the
session result**.

Constraints: overrides never rewrite earlier credits (D-10) or un-solve a solved word (D-7); they are added as new
facts. Overrides are teacher actions and need an audit decision (TPS OD-9).

Validation:

| # | Criterion | Method |
|---|---|---|
| V7-1 | Each override is one teacher action during the session and takes effect for students within one poll | review, test |
| V7-2 | In competition modes, a clue skip or an answer acceptance applies to all teams in the same session, and the session result lists it | test |
| V7-3 | Reassignment is refused after the team has started; adding a late student is accepted | test (as in pgTAP 00017) |
| V7-4 | No override changes an existing credit or an existing solve | test |
| V7-5 | Every override is recorded with the time and the teacher | test |

---

## OX-8. Intermittent Use

EduQuest is used now and then, often weeks apart. Required:

1. **Persistent settings:** the Course Room keeps the last used mode, team setup choice and signal settings; the next
   launch starts from them.
2. **Quick restart:** a new session from a previous one (same puzzle type, same team pattern) without rebuilding it.
3. **Screens understandable without relearning:** the default flow (OX-2) and the run-the-room view (OX-4) work for a
   teacher who last used them weeks ago.
4. **Immediate teacher reset of student access information:** a student who forgot their access information gets new
   information from the teacher during class (password reissue exists today; verification code reset per OX-7).

Validation:

| # | Criterion | Method |
|---|---|---|
| V8-1 | Settings from the last session are prefilled at the next launch | test |
| V8-2 | A session can be started from a previous one in at most the OX-2 steps | review, test |
| V8-3 | A teacher who has not used EduQuest for 4 weeks launches a session without help | classroom trial |
| V8-4 | Resetting one student's access information takes one teacher action and works at once | test, classroom trial |

---

## OX-9. Course Room Continuity

A Course Room **persists for a course term** (a semester or a school year).

| Topic | Rule | Today |
|---|---|---|
| Roster changes | students are added during the term; teams of later sessions use the current roster | built (import, add) |
| Transfer and withdrawal | a transferred or withdrawn student leaves the roster; their data follows retention and erasure (G4); they are not moved out of a started team (P2 D-3) | built (transfer, enrolment `removed`) |
| Co-teacher permissions | co-teachers can be added or removed during the term; access follows at once | built (audited) |
| Academic-year end | the Course Room is archived; data is handled by the approved retention and deletion rules (`docs/pilot`) | archive built; year-end procedure to be defined |

Validation:

| # | Criterion | Method |
|---|---|---|
| V9-1 | A student added mid-term can join the next session; a removed student cannot | test |
| V9-2 | A removed student's work stays attached to the earlier sessions until retention or erasure removes it | test (G4) |
| V9-3 | Co-teacher access starts and ends with the change | test |
| V9-4 | The year-end procedure lists, for every data category, what is kept, archived or deleted | review against `docs/pilot` |

---

## OX-10. Teacher Mobility

The teacher experience must work on a **one-hand mobile or tablet screen**: the teacher walks around the room.

- **During class:** only what is needed to run the room (OX-4 real-time items: teacher help calls, blocked teams,
  missing students, time and intervention controls, session status; launch and overrides).
- **After class:** detailed analysis, on any screen size.

Validation:

| # | Criterion | Method |
|---|---|---|
| V10-1 | Launch (OX-2), the real-time view (OX-4) and every override (OX-7) can be completed one-handed on a phone-width screen | review, device check |
| V10-2 | The in-class view on a phone shows only the OX-4 real-time items and the controls | review |
| V10-3 | Post-class analysis is not required during class for any task | review |
| V10-4 | Tested on one phone and one tablet (Galaxy Tab) during a classroom trial | classroom trial |

---

## OX-11. Graceful Degradation

When something fails, the activity **degrades instead of stopping**, and no student is blamed or exposed.

| Failure | Expected behaviour |
|---|---|
| Network lost | input kept on the device; offline indicator; saves retry with backoff; team updates pause and resume (existing SaveQueue and poller design) |
| Server error | same retry; a neutral message; no loss of saved work |
| Teammate conflict | last save wins on the server; the neutral "다른 팀원이 수정했어요" (K-3, K-4) |
| Feature switched off or access lost | a clear "not available" state; saved data kept (E-5, OFF return) |
| Signals unavailable | play continues without signals (OX-3) |
| One student cannot sign in | the team plays on; the student joins later (P2 D-3) |

Validation:

| # | Criterion | Method |
|---|---|---|
| V11-1 | Offline for 60 s during play: no typed input lost after reconnect | test, classroom trial |
| V11-2 | Server errors during save: retries with backoff; the student sees a neutral message | test |
| V11-3 | Flag off mid-session: routes return "not available"; data kept; nothing else breaks | test (C-12 OFF return) |
| V11-4 | No failure message names a student or suggests fault | review |

---

## OX-12. Projection Safety

The teacher's screen may be shown on a projector or a large display at any moment.

- Any teacher screen that can be projected shows no per-student figures, no individual comparison and no answers by
  default.
- Per-student detail (names with counts, contribution, balance) is on screens meant for the teacher only, clearly
  separated from projectable views.
- The explanation workflow (TPS section 8) shows words and clues; answers appear only when the teacher reveals them.

Validation:

| # | Criterion | Method |
|---|---|---|
| V12-1 | Each teacher screen in a feature package is marked projectable or teacher-only | review |
| V12-2 | Projectable screens contain no student name next to a figure, no per-student comparison and no unrevealed answers | review, test |
| V12-3 | Moving from a teacher-only view to a projectable one needs a deliberate action | review |

---

## OX-13. Minimum Data

Collect, store and show only what an operation needs.

- No new data category without a governance amendment (`docs/pilot/12`, `13`).
- Prefer team-level over student-level data where the operation allows it (signals are team-level only, H-11).
- No focus tracking and no personal stuck time; only a team-level last-progress timestamp; current clue only as
  ephemeral live state (G1 as amended, PKG I-2, I-3); no wrong letters stored unless approved (TPS OD-11).
- Retention and erasure as approved (the pilot retention rule (deleted no later than 30 days after the pilot end date, `docs/pilot/12` §2); erasure G4).

Validation:

| # | Criterion | Method |
|---|---|---|
| V13-1 | Every stored field in a feature package is mapped to an approved purpose and data category | review |
| V13-2 | Response payloads use allow-lists; no extra field leaves a route | test (as in the existing contract tests) |
| V13-3 | Team-level data stays team-level: no student id in signal or help-request records | test |

---

## 3. Conflicts and open points

| # | Issue | Against |
|---|---|---|
| UX-1 | OX-6 reads "Risk-Based Review" as review scaled to risk; the PM confirmed the name, the reading is still to be confirmed | - |
| UX-2 | "Teacher start declaration": **for Gate 3, opening the assignment is the start declaration** (TPS 7.1, G3-D3); a separate start action stays open (TPS OD-7) | TPS OD-7 |
| UX-3 | Team comparison vs constitution rule 4: **resolved** by the interpretation in PKG I-9 | - |
| UX-4 | The first-use target is most threatened by per-student sign-in; the verification code (OX-7, OX-8) implies a new student access model that is not yet specified | TPS QR-1 to QR-6, OD-2 |
| UX-5 | "Blocked teams" and "behaviour signals" stay within amended G1: team-level last-progress timestamp only, no behaviour-type metrics | PKG I-1, I-2 |
| UX-6 | Classroom trials need a rehearsal class or real students, which needs data-governance approval for team data | TPS OD-12 |
| UX-7 | Skip clue and accept answer (OX-7) change completion for a team attempt; how they fit solves, credits and the score rule is not designed | D-7, D-10; OPS H-5 |
| UX-8 | Course Room continuity for a term vs the pilot retention rule (deleted no later than 30 days after the pilot end date, `docs/pilot/12` §2): personal growth across a term needs its own retention rule | OX-9; E-6; DV growth decision |

## Changes

| Version | Date | Change |
|---|---|---|
| v1.0 draft | 2026-11-02 | Sections 1 and 2; section 3 onward pending (request cut off) |
| v1.0 draft rev. 2 | 2026-11-02 | PM decisions 1 to 7: first use 10 / repeat 5 minutes from the start declaration; Peer First; Classroom Before Analytics; Recognition Without Exposure revised; Risk-Based Review; OX-11 to OX-13; validation criteria |
| v1.0 draft rev. 3 | 2026-11-02 | OX-2 and OX-7 to OX-10 added with validation; pending markers removed; conflicts UX-7, UX-8 |
| v1.0 | 2026-11-02 | **Approved** (specification / governance approval) |
| v1.0 draft rev. 5 | 2026-11-02 | UX-2: assignment opening is the Gate 3 start declaration |
| v1.0 draft rev. 4 | 2026-11-02 | Final reconciliation: OX-1 success per team plus 90 % supporting metric; in-class items (I-10); amended G1; team comparison per I-9 |
