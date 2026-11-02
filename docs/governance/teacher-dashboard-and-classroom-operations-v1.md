# Teacher Dashboard and Classroom Operations v1

Status: **APPROVED by the PM (2026-11-02). Resynchronized 2026-11-02 (v1.6)** with the PM clarifications recorded in
the [Collaboration Governance Package v1](eduquest-collaboration-governance-package-v1.md) section G. Governance level:
sits under the [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) and beside the package (see [README](README.md));
where the two disagree, the package wins for collaboration matters and the conflict is reported to the PM.
Documentation only: this document changes no code, schema, flag or deployment.

Source: the PM-approved classroom-operation review and the PM clarifications of 2026-11-02.

> **Source text pending.** The text of the approved classroom-operation review was not available when this document
> was drafted (2026-11-02). Each section records the rules already approved elsewhere, with their source. Insert the
> approved text in place of each marked block; where it differs from a recorded rule, list the difference in section J.

---

## A. Purpose and scope

EduQuest is used in a **teacher-operated classroom** by middle-school students (first) and high-school students
(second); teachers are first-class users (package G-1, G-2). This document fixes how a teacher runs a session:

1. teacher-controlled classroom operation;
2. Course Room based collaboration;
3. competition configuration;
4. student identification;
5. teacher dashboard requirements;
6. help-request policy;
7. scoring policy;
8. classroom facilitation principles.

Every teacher-facing feature package cites the section it relies on, lists conflicts first and stops for a PM
decision when there is one (governance rule of the constitution).

---

## B. Teacher-controlled classroom operation

> **[Insert the approved review text for classroom operation here.]**

| # | Rule | Source |
|---|---|---|
| B-1 | Flow: teacher → Course Room → teams → students. The teacher is present and may intervene during play | package G-2 |
| B-2 | The teacher chooses the mode per assignment: collaboration, challenge or team competition (individual play remains) | package G-4; K23; P1 `play_mode` |
| B-3 | Mode and team composition lock once play starts; a student can join a started team but is never moved out of it | P1 lock trigger; P2 D-3 |
| B-4 | Teams are formed by the teacher; at most 4 members, fewer than 3 is a warning only | P2 D-2 |
| B-5 | Only the Course Room owner and co-teachers operate it; the school admin reads only | TV-1 §8 #2; P2 D-1 |
| B-6 | The teacher opens and closes the assignment window; a closed assignment is read-only for students | M2-2.4 assignments |
| B-7 | Game effects are off by default and teacher-controlled, and never reduce readability | doc 06 §11.7 #4; CE-11 |
| B-8 | Structured collaboration signals (Priority 2) are instructional collaboration tools, not chat. The teacher enables or disables them and chooses a set from predefined approved lists; no teacher free text, no chat moderation system | package H.3, H-9, H-13 |

Open for the review: teacher reset or reopen of an attempt, and limit overrides (TV-1 C-4, C-6; doc 10).

---

## C. Course Room based collaboration

> **[Insert the approved review text for Course Room collaboration here.]**

| # | Rule | Source |
|---|---|---|
| C-1 | The **Course Room** is the official unit: a classroom, an elective course, a high-school credit course, a club or a workshop | package G-3 |
| C-2 | Collaboration means real classroom interaction between peers first; Course Room shared progress (or a shared world) is a motivational layer above the team grids | package G-7, G-8 |
| C-3 | Inside a session, collaboration happens in one team grid of 3–4 students | K15 (leaning team grid); P1/P2 |
| C-4 | **Current implementation:** a Course Room is a `classroom`; an assignment is puzzle × classroom and teams come from that classroom's active enrolments | M2-2.4 schema; P2 |

See conflict J-1.

---

## D. Competition configuration

> **[Insert the approved review text for competition configuration here.]**

| # | Rule | Source |
|---|---|---|
| D-1 | Competition is configurable, not prohibited; it stays last in the value order | package G-4; constitution |
| D-2 | **Individual competition is discouraged**: no individual student rankings or contribution rankings | package G-4, E.2; constitution rule 4 |
| D-3 | **Team competition is allowed when the teacher chooses it**, as a mode (collaboration, challenge, team competition) set for an instructional goal | package G-4 |
| D-4 | Collaboration mode remains the default; progress against a goal ("82% — 다음 목표 90%") is the default board | CE-9; K10 |
| D-5 | 4v4 team battle and school vs school stay deferred as formats; competitive modes are priority 4 | package E.3, F |
| D-6 | Operational rules for competition: team comparison only when the teacher enables it, no member names or per-student figures (OX-5); clue skips and answer acceptances apply equally to every team and are recorded in the session result (OX-7) | Operational UX OX-5, OX-7 |

See conflicts J-2 and J-3.

---

## E. Student identification

> **[Insert the approved review text for student identification here.]**

| # | Rule | Source |
|---|---|---|
| E-1 | Preferred model: teacher roster → QR join → student name selection → session join | package G-9 |
| E-2 | Anonymous nicknames are not the preferred long-term model | package G-9 (supersedes doc 06 CC-6 and K12 as a direction) |
| E-3 | Teachers see the real name and student number of students in their own Course Rooms | TV-1 M-1; CC-6 |
| E-4 | During play, students see no teammate names or writer marks on the grid; a teammate edit appears as "다른 팀원이 수정했어요" | Gate 2 E-3 (modified); P3-D1, P3-D2 |
| E-5 | Help requests never identify the student who asked | G2 |

See conflict J-4.

---

## F. Teacher dashboard requirements

> **[Insert the approved review text for the teacher dashboard here.]**

The Teacher Dashboard is a **core feature**; its data is for instructional support, **not direct grading** (package G-6).

| # | Requirement | Source |
|---|---|---|
| F-1 | **Progress monitoring:** per assignment, one row per enrolled student: name, student number, not started / in progress / completed; progress as filled / total cells; last activity and completion time | TV-1 M-1 to M-3 |
| F-2 | Tool use and wrong submits as counts in neutral wording | TV-1 M-4, M-5 |
| F-3 | **Help requests:** open requests per team, resolved from the dashboard | G2; P2 D-9 |
| F-4 | **Intervention tools** for the teacher during the session | package G-6 (to be specified) |
| F-5 | **Concept understanding signals**, for example the words that needed help most | package G-6; TV-1 S-5, C-1 |
| F-6 | Team mode: per-team status for diagnosis. **Per-student contribution counts and balance indicators are excluded from the MVP** (PM, 2026-11-02) | decision #4; Gate 2 E-3 (modified) |
| F-7 | No typed letters, answers or the student's grid | TV-1 §8 #3; M-6 |
| F-8 | Sorted by roster order or name, never by progress, help or time | TV-1 M-7 |
| F-9 | Team-level last-progress timestamp for classroom operation only; no personal stuck time; current clue only as ephemeral live state; no focus tracking | G1 as amended (package I-2, I-3) |
| F-10 | Never used for grading, ranking or discipline; not exported | G3; package G-6 |
| F-12 | No automated domination, follower or leadership metrics; the Student Behavior Model is for teacher observation | package D, I-1 |
| F-11 | **Team-level collaboration activity** (signals and shared-action Jigsaw use); no per-student signal counts are stored or shown | package H.3, H-11 |

**During class** the dashboard shows only (package I-10): teacher help calls · operationally blocked teams ·
missing / not-started students · time and teacher intervention controls · session status. Everything else in this
table (progress counts, tool use, contribution, balance, concept signals, collaboration activity) is **post-session**
analysis.

Before Gate 3 the minimum is: mode choice, team setup, help resolve and the in-class view above (P3-D8, G3-P3).

---

## G. Help-request policy

> **[Insert the approved review text for help requests here.]**

| # | Rule | Source |
|---|---|---|
| G-1 | Team-level only, one fixed button, no free text. The help request to the teacher is a separate interaction type from team signals | G2; package H-8 |
| G-2 | Anonymous: the request stores the team, never the student | G2; P1 schema |
| G-3 | One open request per team; 60 s cooldown after the teacher resolves it | P2 D-9 |
| G-4 | The teacher resolves it from the dashboard, usually by going to the team in the room; the whole team sees "도움 요청 중" until then | P2; P3 readiness §5; package G-2 |
| G-5 | No personal "time stuck" is measured or shown; the team-level last-progress timestamp may help the teacher see a team that is not moving | G1 as amended (package I-2) |

Open for the review: help requests in individual play (K19).

---

## H. Scoring policy

> **[Insert the approved review text for scoring here.]**

| # | Rule | Source |
|---|---|---|
| H-1 | Growth is improvement compared to one's previous self, measured through recall, review, spaced repetition and personal mastery, not collaborative completion alone | package G-5; constitution |
| H-2 | Team results never stand in for an individual's growth record | package G-5 |
| H-3 | The team achievement "모두 참여 달성" is recognition only: no points, badges, items or ranking effect | Gate 1 D-3 |
| H-4 | Contribution figures are for teacher diagnosis; contribution-based grading is rejected; a credit is a historical fact and is never recalculated | package E.2; G3; P2 D-10 |
| H-5 | A team competition score, when the mode exists, is built from a fixed, tested rule, explained to students in plain Korean, and versioned so old results are not reinterpreted; it is not a grade | doc 06 §1 (`score_version`); package G-4, G-6 |

See conflict J-3.

---

## I. Classroom facilitation principles

> **[Insert the approved review text for facilitation principles here.]**

| # | Principle | Source |
|---|---|---|
| I-1 | Teachers diagnose and intervene in person; the dashboard supports instruction, not judgement | constitution rule 2; package G-2, G-6 |
| I-2 | Peer interaction in the room comes before world-building | package G-7 |
| I-3 | Students are protected: no individual ranking, negative wording or exposure | constitution rules 1, 4, 5; P3-D4 |
| I-4 | Collaboration is encouraged, not forced | constitution rule 6 |
| I-5 | The teacher matches the mode to the instructional goal | package G-4 |
| I-6 | Learning content stays readable whatever effects are on | CE-11 |

---

## J. Conflicts and open questions (review 2026-11-02, after resynchronization)

Reviewed against the constitution, the package (sections B to D as recorded, G clarifications), Vision v3.0, Boundary
v1.0 and Behavior Model v1.0 (full texts still pending), and the Design Vision (**not found**; not reviewed).

| # | Conflict | Against | Proposed resolution |
|---|---|---|---|
| J-1 | A Course Room that spans classrooms (elective, credit course, club) does not fit the current implementation: teams come from one classroom's enrolments and teacher access is per classroom | package G-3; P1/P2 schema; C-8 | Separate schema and access package; until then a Course Room is created as a classroom |
| J-2 | Team competition mode is allowed now, but competitive modes are priority 4 and 4v4 team battle is deferred | package G-4 vs E.3, F | Confirm whether team competition mode moves earlier, or stays priority 4 with only the policy settled now |
| J-3 | Constitution rules 4 and 5 vs team competition | constitution vs package G-4 | **Resolved** (package I-9): individual rankings and comparison prohibited; teacher-configured team comparison allowed under projection safety |
| J-4 | QR join with **student name selection** shows the roster names to students on a shared screen, while the boundary allows no classmate names on student screens. Name selection without a credential also lets a student join as someone else | package G-9 vs C-2, C-3; current per-student sign-in (M1 provisioning) | Decide whether the join list is an allowed exception to the boundary, and whether a check is needed (teacher confirmation, a short code). Needs a data-governance review (`docs/pilot/12`, `13`). OX-7 and OX-8 now name a per-student verification code that the teacher can reset (TPS OD-16) |
| J-5 | Doc 06 CC-6, K12 and `docs/product/01` describe nicknames for students | package G-9 | Mark those lines superseded |
| J-6 | Per-student counts and balance indicators on the teacher view | constitution rule 5 as interpreted (I-9) | **Resolved for the MVP:** excluded (PM, 2026-11-02) |
| J-7 | "Time stuck" and current-clue tracking (doc 06 CE-1, CE-3) | Boundary (C-6) | **Resolved** (package I-2, I-3): team-level last-progress timestamp only; current clue ephemeral |
| J-8 | Team mode is chosen by the teacher and locked, so a student cannot choose to play alone | constitution rule 6 | Define "not forced" (for example, no penalty or exposure for low participation) |
| J-9 | TV-1 lists export as a later item; G3 says the data is not exported | Boundary (C-7) | G3 wins |
| J-10 to J-16 | Signals: sender, help vs signals, Jigsaw budget, teacher-defined signals, stored data, notice volume, priority | package H | **Decided by the PM 2026-11-02**, package H.7 (H-7 to H-13) |

---

## K. Changes

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-02 | First version: recorded rules and conflict review; the approved review text is pending |
| v1.1 | 2026-11-02 | Resynchronized with PM clarifications G-1 to G-10: Course Room unit, teacher-controlled team competition, QR roster join, dashboard as a core feature, growth definition, chat deferred |
| v1.2 | 2026-11-02 | Communication policy: structured collaboration signals (package section H), teacher controls B-8 and F-11, conflicts J-10 to J-16 |
| v1.3 | 2026-11-02 | PM decisions on J-10 to J-16 recorded (package H.7); B-8, F-11, G-1 updated |
| v1.4 | 2026-11-02 | D-6 references Operational UX (OX-5, OX-7); J-4 notes the verification code of OX-7 / OX-8 |
| v1.6 | 2026-11-02 | F-6 and J-6: per-student balance excluded from the MVP; Gate 3 scope in TPS 7.1 |
| v1.5 | 2026-11-02 | Final reconciliation: in-class vs post-session dashboard (I-10); F-9, G-5 per amended G1; F-12 no behaviour-type metrics; J-3, J-7 resolved; J-6 narrowed |
