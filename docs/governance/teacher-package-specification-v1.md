# Teacher Package Specification v1

Status: **APPROVED by the PM (2026-11-02).** A specification / governance approval: it does not approve unresolved
future features (the open decisions of section 10 stay open). The operational layer between governance and implementation: it defines every
teacher-facing workflow. Documentation only: no code, schema, flag or deployment change. Each workflow still needs its
own feature package, PM approval and gate (package F rule 1).

Must comply with: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) ·
[Collaboration Governance Package v1.2](eduquest-collaboration-governance-package-v1.md) ·
[Teacher Dashboard and Classroom Operations v1.2](teacher-dashboard-and-classroom-operations-v1.md) (the file also
records the PM decisions on J-10 to J-16 as v1.3) · [Operational UX Principles v1.0](operational-ux-principles-v1.md) ·
[Design Vision v1](design-vision-v1.md). Short references below: **CON** (constitution), **PKG** (package), **OPS**
(classroom operations), **OX** (operational UX), **DV** (design vision).

Status marks used in this document: **Built** (exists in the code today), **DB ready** (database functions exist, no
UI), **New** (not built), **Decision** (needs a PM decision first).

---

## 1. Course Room Management

A Course Room is the unit of operation (PKG G-3): a classroom, an elective course, a credit course, a club or a
workshop. **Today a Course Room is stored as a `classroom`** (OPS C-4).

| Workflow | State | Rules |
|---|---|---|
| Create room | Built (`createClassroomAction`) | the creator is the owner |
| Edit room | Built (`updateClassroomAction`, settings page) | owner, co-teachers and school admin (`canEditClassroom`) |
| Archive / unarchive room | Built (`archiveClassroomAction`, audited `classroom.archived`) | owner or school admin only; students no longer see an archived room; data is kept and follows retention |
| Co-teacher permissions | Built (add / remove, audited) | added and removed by the owner or school admin; co-teachers then operate the room (roster, teams, play) |

Gaps:
- **Admin role differs by area:** in Course Room management the school admin may edit, archive and manage co-teachers;
  in team and play operation the admin reads only (P2 D-1, PKG C-8). See OD-14.
- A Course Room that mixes students of several classrooms (elective, credit course, club) is not supported: a student
  would have to be enrolled in a second "classroom". See OD-1.
- Room type (classroom, elective, club ...) is not recorded. Not needed for the MVP.

---

## 2. Roster Management

| Workflow | State | Rules |
|---|---|---|
| Roster import | Built (CSV batch: preview, commit, credential CSV for the teacher) | student numbers unique per school; no free text about students (`docs/pilot/12`) |
| Manual add | Built (new student; add existing student; transfer) | |
| Active / inactive students | Built as enrolment status `active` / `removed` | a removed student keeps their data until erasure (G4); team rules count active enrolments only (P2) |
| Student identification flow | Built: per-student account, username + temporary password, forced password change, lockout after failed attempts | |

### 2.1 Review of the QR join model (PKG G-9: roster → QR join → name selection → session join)

Not built. Issues only; no redesign here (as requested).

| # | Issue | Against |
|---|---|---|
| QR-1 | **Name list on a student screen:** selecting one's name shows the classmates' names to every student who scans | PKG C-2, C-3 (no classmate names); H-7 |
| QR-2 | **No credential:** anyone in the room can pick another student's name and act as them; their work and credits go to the wrong record | CON rule 1; P2 D-10 (a credit is a historical fact) |
| QR-3 | **Link leaves the room:** a photographed or forwarded QR code lets someone outside the class join as any listed student | PKG G-2 (teacher-operated classroom) |
| QR-4 | **Two identity models:** QR join and the existing accounts would both exist; the growth record (recall, spaced repetition, PKG G-5) needs one stable identity across sessions | PKG G-5 |
| QR-5 | **Shared and mixed devices:** a session left open on a shared tablet carries the previous student's identity | OPS G-2 |
| QR-6 | **Data governance:** a new sign-in method and session data are not in `docs/pilot/12`, `13` | `docs/pilot` |

OX-7 and OX-8 refer to a **student verification code** that the teacher can reset at once. This points to a join
model with a per-student code (which would address QR-2 and QR-3), but the model is not specified yet. See OD-2, OD-16.

---

## 3. Team Formation

| Method | State | Notes |
|---|---|---|
| Manual grouping | DB ready (`fn_crossword_team_create`, `_assign`, `_unassign`, `_delete`, `_list`) | the teacher picks members |
| Random grouping | New | a proposal the teacher confirms or edits before it is saved; shown inside Confirm Setup (OX-2) |
| Heterogeneous grouping | New, **Decision** | mixes students by a criterion; which data may be used is open (OD-4) |

Governance constraints for every method:

| # | Constraint | Source |
|---|---|---|
| TF-1 | Teams are formed by the teacher (owner or co-teacher); students do not form teams | P2 D-1; OPS B-4 |
| TF-2 | At most 4 members; fewer than 3 is a warning only | P2 D-2 |
| TF-3 | Only actively enrolled students of the Course Room | P2 |
| TF-4 | Before start: free changes. After start: a student may join; nobody is moved out or removed | P2 D-3 |
| TF-5 | Unassigned students are listed and see "팀 배정 대기" | P2 D-4 |
| TF-6 | Students never see why they were grouped together, or any ability label | PKG C-2; CON rule 1 |
| TF-7 | A grouping criterion is never shown as a ranking and is never used for grading | CON rule 4; G3 |
| TF-8 | Generated groupings are proposals; nothing is saved until the teacher confirms | OPS B (teacher-controlled) |

---

## 4. Play Modes

| | A. Individual Check | B. Team Collaboration | C. Team Challenge |
|---|---|---|---|
| Teacher objective | check what each student can recall alone | practise and discuss with peers; build understanding together | motivate a team to reach a goal under a challenge (time or target) |
| Expected use | review at the start or end of a unit; homework; before and after comparison | in-class activity, new vocabulary, mixed-level teams | unit wrap-up, revision lesson, a special event |
| Grid | one per student | one shared grid per team (3–4) | one shared grid per team |
| Hints and checks | personal limits | shared team budget (D-6) | shared team budget; challenge settings may change limits (OD-5) |
| Signals | none | structured collaboration signals (PKG H) | structured collaboration signals |
| Feeds the growth record | **yes** (personal recall, PKG G-5) | no: team completion is not individual growth (OPS H-2) | no |
| Comparison | none | none | the team against its own goal; whether teams are compared is open (OD-6) |
| State | Built (individual play) | DB ready (P2 team mode) | **New, Decision** |

Differences in one line: A measures the individual; B builds understanding together; C adds a goal or a time limit to
B. Mode is chosen per assignment by the teacher and locks at start (K23, P1).

Notes: PKG G-4 names "collaboration, challenge and team competition" modes; this package uses the three modes above.
Whether "Team Challenge" also covers team competition, or competition is a fourth mode, is OD-6. The schema has only
`individual` and `team`.

---

## 5. Session Controls

A session is one assignment of a puzzle to a Course Room, open between its start and close times.

| Control | State | Governance decision still required |
|---|---|---|
| Start | Built (opens-at time of the assignment) | whether a "start now" button replaces scheduled opening (OD-7) |
| Pause | New | what pauses (input, timer, the challenge clock) and what students see (OD-7) |
| Resume | New | as pause |
| Close | Built (close an assignment; read-only for students) | none |
| Add time | New; **approved as a teacher override** (OX-7) | for whom (all, one team) and its effect on a Team Challenge result (OD-7) |
| Skip a flawed clue | New; **approved** (OX-7) | how a skipped clue counts for completion, solves and credits (OD-15); in competition modes it applies to every team and is recorded in the session result |
| Accept an answer | New; **approved** (OX-7) | as skip (OD-15) |
| Add a late student | DB ready (P2 D-3); **approved** (OX-7) | none |
| Reassign a student | DB ready before start; **approved where governance permits** (OX-7) | none: refused after the team has started (P2 D-3) |
| Reset a student verification code | New; **approved** (OX-7, OX-8) | the verification code model (OD-16) |
| Reset team | New, **Decision** | conflicts with D-7 (solved words stay solved) and D-10 (credits are historical); what happens to stored credits, events and the team budget (OD-8) |
| Reopen attempt | New, **Decision** | open since `docs/m2/10` (teacher override); whether a completed team attempt can reopen and what students see (OD-8) |

All controls: owner and co-teachers only; no effect on other Course Rooms; recorded (OX-7 V7-5; audit decision OD-9);
usable one-handed on a phone or tablet (OX-10). Overrides never rewrite credits or un-solve words (D-7, D-10).

---

## 6. Structured Collaboration Signals

Approved governance: PKG H (H-1 to H-14). Priority 2. Instructional collaboration tools, not chat. **No free text.**

### 6.1 Categories

| Category | Examples (PKG H.2) |
|---|---|
| Quick messages | Check this clue · Please look at this word · Let's check the intersection · Good idea |
| Collaboration actions | I can help here |
| Teacher-defined signals | a set chosen from predefined approved lists (H-9) |

The **help request to the teacher** is a separate interaction type (H-8), see the dashboard (section 7).

### 6.2 Lifecycle

1. The teacher enables signals for the assignment and picks an approved set (or leaves them off).
2. A student sends a signal from a fixed button.
3. Rate limit: one visible signal per team, 10 s cooldown (H-12).
4. Teammates see it without a sender name (H-7), in the status area, never over the grid (H-5, CE-11).
5. It disappears automatically (one visible notice at a time, about 5 s, P3 D9).
6. Only a team-level count is stored; no per-student record (H-11). Retention per the pilot retention rule (deleted no later than 30 days after the pilot end date, `docs/pilot/12` §2).

### 6.3 Teacher configuration

On or off per assignment; one set from the approved lists; no teacher free-text messages (H-9); no moderation tool
(H.3).

### 6.4 Dashboard visibility (post-session)

Per team, after the session: signal use by category (counts). Never per student (H-11). Signals are never the basis
of a badge (I-4). For instructional support, not grading (H-6).

### 6.5 Clue-Sharing Game Actions (separate from signals)

Shared-Action Jigsaw actions (share a picture clue, an initial-letter clue, an example sentence; reveal a supporting
clue) are **game actions, not signals** (PKG H.4, I-4). They use no hint budget. They may give the student a one-time
private impact feedback, which is not stored. Durable personal records of clue sharing wait for a later Growth / Data
Governance decision; the personal clue-sharing badge is deferred.

---

## 7. Teacher Dashboard MVP

Minimum for **Gate 3** (P3-D8, G3-P3), and what follows.

**During class** the dashboard shows only (PKG I-10, OX-4). For the first Gate 3 (PM interpretation, 2026-11-02):

| In-class item (Gate 3) | Category | Source |
|---|---|---|
| Student state: not started · in progress · completed | **Required** | TV-1 M-1; OX-4 |
| Team help state (open call, resolve) | **Required** | G2; P2 D-9 |
| Operationally blocked state of a team (with the team-level last-progress time) | **Required** | OX-4; PKG I-2 |
| Session close control | **Required** (built) | OX-7; section 5 |

Not shown in class: per-student contribution counts, balance indicators, domination / follower / leadership metrics,
individual comparison sorting. The existing filled / total progress may stay **teacher-only** when it is never used to
rank or sort students. Add time and other overrides come later (section 5).

Setup and post-session:

| Item | Category | Source |
|---|---|---|
| Mode choice (individual / team) per assignment | **Required** (setup) | K23; P2 |
| Team setup: create, assign, move before start, unassigned list, under-3 warning | **Required** (setup) | P2 D-1 to D-4 |
| Access: owner and co-teachers; admin read-only; no letters or answers; roster order | **Required** | OPS F-7, F-8; PKG C-8 |
| Team progress view: per team progress and results | **Required** (post-session) | decision #4; OPS F-6 |
| Individual progress view (TV-1) | **Required** (built; post-session use, its not-started state feeds the in-class view) | TV-1 |
| Per-student contribution counts and balance indicator | **Excluded from the MVP** (PM, 2026-11-02) | decision #4; OD-10 |
| "As of" time and refresh | Recommended | TV-1 S-4 |
| Words that needed help most (concept signal) | Recommended (post-session) | OPS F-5 |
| Random grouping | Recommended (setup) | section 3 |
| Signal controls and team signal counts | Future (Priority 2) | PKG H |
| Session controls pause, resume, add time | Future | section 5 |
| Heterogeneous grouping, Team Challenge, results review | Future | sections 3, 4, 8 |
| QR join | Future, **Decision** | section 2.1 |

No automated domination, follower or leadership metrics (PKG I-1).

### 7.1 Gate 3 scope decisions (PM, 2026-11-02)

| # | Decision |
|---|---|
| G3-D1 | **Excluded from the first Gate 3:** the Ask Team structured signal and anonymous current-clue awareness. No Migration C, no Supabase Realtime. Deferred to a separate **Live Collaboration Presence Package** (Future Priority 2, not rejected) |
| G3-D2 | No signal storage, no team signal count, no per-student signal data |
| G3-D3 | **Opening the assignment is the start declaration.** Measure assignment open → every team started; supporting metric: at least 90 % of present test students made a first input; external device faults recorded separately |
| G3-D4 | No new audit-action value or audit event for Gate 3 test-account teacher team actions; audit policy stays open before real-student use (OD-9) |
| G3-D5 | Hosted Gate 3 needs a separate precondition approval: SMOKE / test accounts only, no real student data, no real names, credential-safe evidence, a cleanup / retention decision, the Governance #6 decision. Planning and local implementation are not blocked |
| G3-D6 | Structured Collaboration Signals are **not** in the first Gate 3. Students use the shared grid, shared tools, the teacher help request and in-person classroom communication |
| G3-D7 | `CROSSWORD_PLAY_ENABLED` and `COLLAB_PLAY_ENABLED` are both ON only for the approved test window; afterwards both OFF, redeploy, OFF Return verification. Hosted flag changes and deployments need separate approvals |

Never: focus tracking or personal stuck time (G1 as amended, PKG I-2); current clue only as ephemeral live state (I-3); export (G3); grading. During class the dashboard shows only the run-the-room
items (OX-4, OX-10); projectable views follow OX-12.

---

## 8. Results Review

After a session, for the teacher only. Students keep their own result screen (positive wording, P3-D4).

| Review | Content | State and limits |
|---|---|---|
| Team review | per team: completed or not, words solved, tools used (team totals), participation (all members contributed), help requests | data exists (P2 solves, credits, counters); no ranking or ordering of teams (CON rule 4) |
| Concept review | per word: how often check, reveal or 초성 was used, across teams | from events (word number and direction); no letters |
| Misunderstanding review | which wrong answers were common | **not possible today:** wrong letters are deliberately not stored (docs/m2/13 §1.3, product/01 §3); needs a new data category (OD-11) |
| Explanation workflow | the teacher picks words from the concept review and explains them to the class (clue, answer, example) on the teacher's screen | no student or team names on a projected screen (PKG C-2); answers shown only on the teacher's own display |

Results are not grades and are not exported (G3).

---

## 9. Teacher Workflow

### Before class
Content review (puzzle review and publish) happens here, never inside the launch (OX-2, OX-6).

1. Open or create the Course Room; check co-teachers.
2. Check the roster (import or add; remove students who left).
3. Choose a puzzle and assign it with a window.
4. Choose the mode: Individual Check, Team Collaboration or Team Challenge.
5. For team modes: form teams (manual, or random as a proposal); check the unassigned list.
6. Optionally: enable signals and choose a set (Priority 2).

### During class
0. Launch: Select Activity → Confirm Setup → Start (OX-2); the start declaration starts the 10 / 5 minute target (OX-1).
1. Students sign in and open the assignment (team members join one shared attempt).
2. Watch the in-class view (help calls, blocked teams, not-started students, session status); respond to a help call
   by going to the team; resolve it.
3. Late students: add to a team (allowed after start; nobody is moved out).
4. Use session controls (close; later pause, resume, add time).
5. No grading during play; the dashboard is for intervention (PKG G-6).

### After class
1. Close the assignment if it is still open.
2. Team review and concept review.
3. Explain the words that needed most help (explanation workflow).
4. Plan follow-up: an Individual Check later on the same words to see personal recall (PKG G-5).
5. Data follows the pilot retention rule (deleted no later than 30 days after the pilot end date, `docs/pilot/12` §2) and erasure (G4).

---

## 10. Open Decisions

### 10.1 Governance Gaps

Decisions the PM must take before the related workflow is built.

| # | Decision | Area | Related |
|---|---|---|---|
| OD-1 | How a Course Room that mixes classrooms is modelled (second enrolment or a new unit) | section 1 | OPS J-1 |
| OD-2 | QR join: whether to adopt it given QR-1 to QR-6, and what replaces the missing credential | section 2.1 | OPS J-4; PKG G-9 |
| OD-3 | Random grouping: proposal only, or saved directly | section 3 | TF-8 |
| OD-4 | Heterogeneous grouping: which data may be used (none, teacher's own labels, earlier results); where it is stored | section 3 | TF-6, TF-7; `docs/pilot/12` |
| OD-5 | Team Challenge: definition (time limit, target, both), limits, and what "challenge" changes | section 4 | PKG G-4 |
| OD-6 | Team competition: part of Team Challenge, a fourth mode, or later (priority 4). Comparison itself is settled: teacher-configured team comparison allowed under projection safety (PKG I-9) | section 4 | OPS J-2 |
| OD-7 | Session controls: pause, resume; scope of add time (approved in OX-7). **For Gate 3** the start declaration is opening the assignment (G3-D3); a separate start action stays open | section 5 | OX-1, OX-7 |
| OD-8 | Reset team and reopen attempt vs D-7 and D-10 | section 5 | `docs/m2/10` |
| OD-9 | Audit for teacher team and session actions: **none for Gate 3 on test accounts** (G3-D4); open before real-student use | sections 3, 5 | P2 finding 1 |
| OD-10 | ~~Per-student contribution and balance~~ **Decided:** excluded from the MVP (PM, 2026-11-02) | section 7 | OPS J-6 |
| OD-11 | Misunderstanding review: whether wrong answers may be stored, and for how long | section 8 | `docs/pilot/12`, `13` |
| OD-12 | Data governance amendments for team data, signals and sessions before real students use them; governance #6 (B-5) | all | G3-P4 |
| OD-13 | ~~Signals in Gate 3~~ **Decided:** not in the first Gate 3 (G3-D1, G3-D6); Ask Team and current-clue awareness go to the Live Collaboration Presence Package | sections 6, 7 | PKG F, H-15 |
| OD-14 | School admin rights: write in Course Room management (today) but read-only in team and play operation; keep the split or align | section 1 | P2 D-1; PKG C-8 |
| OD-15 | Skip a flawed clue and accept an answer: effect on completion, solves, credits and a competition score | section 5 | OX-7; D-7, D-10 |
| OD-16 | Student verification code: what it is, how it combines with QR join and the existing accounts | section 2.1 | OX-7, OX-8; OD-2 |

### 10.2 Technical Risks

| # | Risk | Affects | Mitigation (for the feature package) |
|---|---|---|---|
| TR-1 | Play mode exists only as `individual` / `team` and locks at start (P1 trigger); Team Challenge and any settings need a schema change | section 4 | separate migration package; keep the lock rule |
| TR-2 | A Course Room is a `classroom`; mixed rooms touch enrolments, access functions and every team rule that counts active enrolments | sections 1, 3 | design before any mixed-room UI |
| TR-3 | `audit_action` has no team or session values; adding them is a migration, and the P2 functions write no audit rows | sections 3, 5 | decide OD-9 before TP-0 hosted use |
| TR-4 | Pause and add time interact with the assignment window, the grace period and the read-only checks in every play function; team members could see different read-only states | section 5 | server-side session state read by the play functions |
| TR-5 | Solves and credits are insert-only and linked through `team.attempt_id`; a team reset either deletes history or needs a new attempt | section 5 | follow OD-8; never rewrite credits silently (D-10) |
| TR-6 | Random and heterogeneous grouping assign many students one by one through locking functions; a partial failure leaves half-formed teams | section 3 | proposal first, then one confirmed batch; show failures |
| TR-7 | Team-state polling: about 7.5 requests/s for 30 students, each briefly locking the attempt row (P3-D7); signals add traffic | sections 6, 7 | measure at Gate 3; non-locking read later if needed |
| TR-8 | Signals need new storage and a server-side rate limit; visible latency is up to one poll (4 s) | section 6 | signals package with its own tests |
| TR-9 | QR join adds a second sign-in path next to the existing accounts, with shared-device session risks | section 2.1 | only after OD-2 |
| TR-10 | Gate 3 depends on a flag window (COLLAB_PLAY_ENABLED, CROSSWORD_PLAY_ENABLED); P2 on Acceptance is SUCCESS / CLOSED (28 / 28 fingerprints, security checks, W1 unchanged, H10 done) | section 7 | plan the flag window and OFF return with the Gate 3 package |
| TR-11 | Team mode on tablets (IME, shared grid) is not yet tested on devices | section 7 | Galaxy Tab check recommended, not blocking (decision #6) |

### 10.3 Future Enhancements

| # | Enhancement | Waits for |
|---|---|---|
| FE-1 | Random grouping, then heterogeneous grouping | OD-3, OD-4 |
| FE-2 | Team Challenge mode | OD-5, TR-1 |
| FE-3 | Pause, resume, add time; reset team; reopen attempt | OD-7, OD-8 |
| FE-4 | Misunderstanding review | OD-11 |
| FE-5 | Structured collaboration signals (Priority 2) | OD-13, OD-12 |
| FE-6 | QR join | OD-2 |
| FE-7 | Mixed Course Rooms (electives, credit courses, clubs) | OD-1 |
| FE-8 | Individual Check linked to the personal dictionary and spaced repetition (Priority 3) | Growth Model package |
| FE-9 | Team competition (Priority 4) | OD-6 |
| FE-10 | Remote participation | PKG H.1 (future phases) |

---

## Changes

| Version | Date | Change |
|---|---|---|
| v1 draft | 2026-11-02 | Sections 1 to 10 per the PM task; section 10 split into governance gaps, technical risks and future enhancements |
| v1 draft rev. 2 | 2026-11-02 | Aligned with OX-1 to OX-13 and Design Vision v1: overrides approved (OX-7), launch flow, verification code, OD-15, OD-16 |
| v1 | 2026-11-02 | **Approved** (specification / governance approval) |
| v1 draft rev. 4 | 2026-11-02 | Gate 3 scope decisions G3-D1 to G3-D7 (7.1); in-class view for Gate 3; per-student balance excluded from the MVP; OD-7, OD-9, OD-10, OD-13 updated |
| v1 draft rev. 3 | 2026-11-02 | Final reconciliation: in-class vs post-session dashboard (I-10); signals and clue-sharing game actions separated (6.5); amended G1; no behaviour-type metrics |
