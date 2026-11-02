# Long-Term Product Direction v1

Status: **CONDITIONALLY APPROVED by the PM (2026-11-02).** Stage 1 and Stage 2 are approved; Stage 3 and Stage 4 are
deferred and redefined (section 3). Documentation only: no code, schema, flag or deployment change, and **no legal or
retention commitment**. **No stage is entered automatically:** each needs its gate (section 4), a PM decision, its own
packages and data-governance amendments.

Must comply with: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) (**CON**) ·
[Collaboration Governance Package](eduquest-collaboration-governance-package-v1.md) (**PKG**) ·
[Teacher Dashboard and Classroom Operations](teacher-dashboard-and-classroom-operations-v1.md) (**OPS**) ·
[Teacher Package Specification](teacher-package-specification-v1.md) (**TPS**) ·
[Operational UX Principles](operational-ux-principles-v1.md) (**OX**) · [Design Vision](design-vision-v1.md) (**DV**) ·
[Growth Model and Mastery](growth-model-and-mastery-v1.md) (**GM**).

Review basis: the draft of 2026-11-02 and a **Same-session Red Team Review** (R2, section 15). Neither is an
independent external review.

---

## 1. Purpose

EduQuest exists so that **what students learn in class stays with them**.

| Idea | Meaning for EduQuest |
|---|---|
| **Classroom learning** | the lesson is where learning starts: a teacher, a Course Room, peers working together (PKG G-2, G-7) |
| **Growth** | improvement compared to one's previous self, shown by personal recall (CON rule 3; GM section 1) |
| **Long-term mastery** | words that remain: Encountered → Recall → Retained (GM) |
| **Communities** | **Teacher Community First:** teachers sharing reviewed content; student groups only inside teacher-governed scopes (section 3, Stage 4) |

*Collaboration creates opportunities for learning. Personal recall provides evidence that learning remained* (GM).

EduQuest is a **school product run by teachers**. It is not on a path to an independent student app or a consumer
(B2C) product (section 11).

---

## 2. Current State

**Teacher-Operated Classroom Platform.** A platform that a teacher operates inside a lesson. The teacher prepares, launches, watches and closes
every activity; students take part only through activities the teacher opened.

```
School administrator layer (direction)  ·  Teacher-owned content library (direction)
                                ↓
Teacher → Course Room → Teams → Students
```

| Property | Current state |
|---|---|
| Who starts learning | the teacher (OX-2 launch) |
| Where | the classroom, teacher present (PKG G-2) |
| Unit | the Course Room (PKG G-3); stored as a classroom today |
| Growth evidence | Individual Check and Review Mode in teacher-run sessions (GM 3.4, 3.6) |
| Student-to-student | shared team grid, anonymous structured signals, clue-sharing game actions; no chat (PKG H, I-7) |
| Data | operational data plus (when approved) growth data, with separate retention (GM 8) |

---

## 3. Stage Model

```
Stage 1                 Stage 2                    Stage 3                              Stage 4
Teacher-Operated   →    Teacher-Supported    →     Student Agency in             →      Teacher Community
Classroom Platform      Learning                   Teacher-Governed Learning            First
APPROVED (now)          APPROVED after LT-1        DEFERRED (LT-2)                      DEFERRED (LT-3)
```

**Supersession note.** The draft names "Student-Driven Growth" (stage 3) and "Learning Communities" (stage 4) are
superseded by the names above and are not active stages.

### Stage 1: Teacher-Operated Classroom Platform

**Status: APPROVED. Current focus.** Section 2, plus the work already approved: team play (P1 to P3), the Teacher
Package (TPS), the Operational UX principles (OX) and the Growth Model (GM) inside teacher-run sessions.

Delivery status: P1 schema and **P2 function layer applied to Acceptance: SUCCESS / CLOSED** (two P2 migrations
applied, postcheck fingerprints 28 / 28, security checks passed, W1 baseline unchanged, H10 credential cleanup
completed). Next: the Stage 1 Gate 3 integrated package (TP-0 teacher minimum and P3 student team play).

### Stage 2: Teacher-Supported Learning

**Status: APPROVED, entered after gate LT-1.** The teacher still guides everything; learning can continue beyond one
lesson.

| Item | Meaning |
|---|---|
| Assigned personal review | the teacher assigns review to students (in class, or between lessons when the access model allows it, OD-L3) |
| Review Mode | GM 3.6 (5 to 10 questions, 4 minutes, 80 / 20 mix, on by default) |
| Spaced repetition | GM review intervals bring due words back |
| Teacher content library | each teacher's own reviewed puzzles and word sets, reusable across terms and Course Rooms |
| Teacher content sharing | a teacher shares reviewed content with colleagues |
| School administrator layer | school-level settings and oversight above Course Rooms (section 6) |

### Stage 3: Student Agency in Teacher-Governed Learning

**Status: DEFERRED.** Students make limited choices **inside rules the teacher sets**.
**Not an independent B2C student app.**

Includes only:
- student-selected review words;
- student-selected review timing within teacher rules;
- private growth goals (DV P-5; never compared, never shown to classmates);
- student-created clues **with teacher approval** (OX-6: student content is high-risk and always reviewed);
- self-reflection (fixed or structured prompts; no free text between students, PKG I-7).

### Stage 4: Teacher Community First

**Status: DEFERRED.**

Prioritises:
- teacher content libraries;
- reviewed puzzle sharing;
- department-level sharing;
- anonymised concept-misunderstanding statistics (aggregate across Course Rooms, no student identifiable);
- curriculum and textbook update workflows.

**Student communities are limited to teacher-governed scopes** (a Course Room, a club or a group of Course Rooms with a
responsible teacher). **No open cross-school student communities.**

---

## 4. Stage Gates

**No stage is entered automatically.** A gate is passed only by a PM decision on recorded evidence.

| Gate | Transition | Evidence required |
|---|---|---|
| **LT-1** | Stage 1 → Stage 2 | repeated teacher use: the **same teacher uses EduQuest at least three times in a term**; the **repeat-use five-minute launch target** is met (OX-1); **content review and classroom recovery are validated** (OX-6, OX-11); **Growth Data governance is approved** (GM 8, section 8) |
| **LT-2** | Stage 2 → Stage 3 | **Review Mode participation**; **evidence of improved delayed recall** (Retained outcomes, GM); an approved **student-access and identity model** (TPS OD-2, OD-16); **Growth Data retention and ownership** decided (section 8); **evidence that student agency does not increase teacher burden** |
| **LT-3** | Stage 3 → Stage 4 | **teacher approval rate for student-created clues**; **teacher content reuse**; **moderation and ownership** rules for shared content; a working **school administrator layer**; an **operating and financial model** (section 10) |

---

## 5. Product KPIs

Primary KPIs (student voluntary return is **not** a primary KPI):

| KPI | What it shows | Source |
|---|---|---|
| Teacher reuse | teachers come back: sessions per teacher per term (LT-1: at least three) | session records |
| Repeat-use launch time | operational cost per lesson (OX-1, 5 minutes) | classroom trials, session start declaration |
| Student response when the teacher reopens the activity | share of present students with a first input after the teacher starts a session | OX-1 supporting metric |
| Review Mode completion | review sessions finished as assigned | GM 3.6 |
| Delayed recall outcomes | words reaching Retained | GM |
| Teacher use of post-session results | teachers open team, concept and growth reviews after a session | TPS 8 |

KPIs are product measures, never student evaluation (G3), and are reported in aggregate.

---

## 6. Course Room Hierarchy and Lifecycle

### 6.1 Hierarchy (direction)

| Level | Need |
|---|---|
| **School administrator layer** | school-level settings, teacher accounts, oversight; read-only towards play and team operation unless decided otherwise (TPS OD-14) |
| **Teacher-owned content library** | content belongs to the teacher who made it, reused across terms and Course Rooms, shareable (Stage 2) |
| **Course Room** | the unit of operation (PKG G-3) |
| **Teams, students** | as today |

**Multi-school Course Rooms** stay a separate future schema and access review.

### 6.2 Lifecycle

| Phase | What happens |
|---|---|
| Creation | a teacher creates the room for a course term; roster, co-teachers (TPS 1, 2) |
| Semester | sessions, teams, Review Mode; roster changes, transfers and withdrawals (OX-9) |
| School year | the room may run for a year |
| Archive | no new sessions; students no longer see it; operational data follows its own retention (OX-9) |
| Successor rooms | next term's room for the same group or course; how it is linked, and what moves, needs the governance decision of section 8 |

---

## 7. Growth Data Lifecycle

Conceptual only: **no implementation, no legal or retention commitment.**

| | Operational data | Growth data |
|---|---|---|
| Centre | **session and Course Room** | **the persistent internal student identity** (resolved 2026-11-03; earlier "the student, in concept") |
| Examples | attempts, teams, solves and credits, help requests, signal counts, session state, last-progress timestamps | dictionary entries, stages, review history (outcomes only), badges, review intervals |
| Purpose | run a session and review it afterwards | the student's personal learning record and review scheduling |
| Conceptual retention need | short (as long as the teacher reviews the session) | long enough for growth to mean anything |

Rules that hold at every stage: separate retention policies (GM 8); a growth record never keeps an operational record
alive; growth never affects scores, competition or combos (GM 1); new categories only after a data-governance
amendment (OX-13; `docs/pilot`).

---

## 8. Data Ownership Decisions Before Stage 3

**Resolved (PM, 2026-11-03):** personal association of Growth Data → the **persistent internal student identity**
(constitution "Student identity"; Growth Model 5.1). This is personal association, not legal ownership, and it resolves
nothing else.

The rest stays **directional**. Before Stage 3, a **separate governance decision** is still required for each of:

| # | Topic | Status | Relation to the identity principle |
|---|---|---|---|
| DO-1 | Course Room succession | open | the record's association does not move with a room; what a successor room may use is open |
| DO-2 | Teacher access to previous growth | open | association is settled; who may see it is not |
| DO-3 | School-year transition | open | the association continues across years in concept; what is kept and shown is open |
| DO-4 | Transfer (within and out of the school) | open | the internal identity is per school today; transfer rules are open |
| DO-5 | Erasure | open | erasure of the identity and its records is open (with account deactivation, deletion and merge, TPS OD-TP19, OD-TP20) |
| DO-6 | Student and guardian access to growth data | open | the subject of the record is known; access rights are open |
| DO-7 | Retention | open | the association says whose record it is, not how long it is kept |

---

## 9. Competition Evolution

| Kind | Direction |
|---|---|
| Individual competition | **discouraged**; individual rankings and direct individual comparison stay prohibited (CON interpretation) |
| Teacher-controlled team competition | **may exist**, as a mode the teacher chooses for an instructional goal, under projection safety (PKG G-4, I-9; OX-5, OX-12) |
| Team Challenge | a team against its own goal or a time frame (TPS 4) |
| Course Room shared goals | the whole room against a shared target; cooperative |
| 4v4 team battle | **remains deferred** (PKG E.3) |
| School vs school | remains deferred (PKG E.3) |

Growth outcomes never feed competition (GM 1).

---

## 10. Strategy Areas

| Area | Direction | Open |
|---|---|---|
| **Effectiveness validation** | delayed recall outcomes (Retained) compared over a term within the same students; teacher judgement of concept understanding; field validation (R4) before claims are made | study design, comparison baseline, who runs it |
| **Operating and financial model** | a school product paid for or provided at school or district level, not by students; costs follow teacher and school use | pricing, funding source, hosting cost per school (LT-3 needs it) |
| **School adoption requirements** | data-governance sign-off per school (`docs/pilot/12`, `13`), a responsible administrator, device and network readiness, teacher onboarding within the first-use target (OX-1) | per-school checklist |
| **Content sustainability** | teacher content libraries and sharing (Stage 2, 4); curriculum and textbook update workflows; reviewed content only (OX-6) | content ownership and licence when shared, update responsibility |
| **LMS / roster integration** | import rosters from school systems instead of manual entry; possibly hand back non-grading activity status | which systems, data flow direction, no grade export (G3) |
| **Long-term operating ownership** | a named owner for operations, data governance, support and content quality per school and overall | organisation and roles |

---

## 11. Explicitly Out of Scope

| Removed or rejected | Reason |
|---|---|
| An independent student app outside school as the natural next stage | EduQuest is teacher-operated and teacher-governed at every stage |
| Open student communities | student groups only inside teacher-governed scopes (Stage 4) |
| School-to-school student communities | no cross-school student contact |
| A B2C transition as an assumed roadmap | not part of any stage |
| Voluntary student return as the primary success metric | replaced by the KPIs of section 5 |

---

## 12. Teacher-Led Evolution

```
Teacher-Operated Classroom Platform → Teacher-Supported Learning → Student Agency in Teacher-Governed Learning → Teacher Community First
```

| Stage | Who initiates | Teacher role | Student role |
|---|---|---|---|
| 1 | teacher | operates every activity | takes part |
| 2 | teacher | assigns review, builds and shares content | reviews as assigned |
| 3 | teacher sets rules; student chooses within them | approves student clues, sets limits | chooses review words and timing, private goals, reflection |
| 4 | teachers together | share and maintain content, read anonymised concept statistics | as in stage 3, within teacher-governed groups |

Each stage keeps every guarantee of the earlier stages; the teacher stays the governor at every stage (CON rule 2).

---

## 13. Non-Negotiable Principles

**Growth > Achievement > Collaboration > Competition** remains unchanged at every stage (CON).

Also unchanged at every stage: the six constitution rules and their interpretation; the information boundary (PKG C);
structured communication only (PKG I-7); growth is personal recall (GM); data minimum (OX-13); learning content stays
readable (CE-11).

---

## 14. Review and Remaining Risks

### 14.1 Risks (after reconciliation, 2026-11-02)

| # | Risk | After reconciliation |
|---|---|---|
| L-1 | Drift into a social platform | **reduced:** open and cross-school student communities rejected; Stage 4 is teacher community first |
| L-2 | Equity gaps from outside-class learning | **reduced:** review is assigned by the teacher; outside-class use depends on the access model (OD-L3) |
| L-3 | Long-lived growth records of minors | **reduced:** no commitment; DO-1 to DO-7 required before Stage 3 |
| L-4 | Engagement mechanics without a teacher | **reduced:** student agency only within teacher rules; voluntary return not a KPI |
| L-5 | Growth data misuse for grading | unchanged: G3 and GM 9 hold |
| L-6 | Teacher workload | **addressed by gate:** LT-2 requires evidence that agency does not increase burden |
| L-7 | Low motivation without the classroom | **reduced:** no stage depends on voluntary student use |
| L-8 | Community moderation | **reduced:** moderation and ownership are part of LT-3 |
| L-9 | Identity outside class | **gated:** the access model is part of LT-2 |
| L-10 | **New:** content sharing spreads unreviewed or wrong content between teachers | shared content must be reviewed content (OX-6); ownership and update rules in section 10 |
| L-11 | **New:** the school administrator layer gives admins more power than the current read-only rule for play data | TPS OD-14 |

### 14.2 Conflicts

| # | Conflict | Status |
|---|---|---|
| LC-1 | Later stages vs the teacher-operated environment (PKG G-2) | **resolved:** every stage stays teacher-governed |
| LC-2 | Sign-in outside class vs the room-based QR model | **gated** by LT-2 (student-access and identity model) |
| LC-3 | Cross-class communities vs Course Room scope | **resolved** for students: teacher-governed scopes only; multi-school rooms a separate review |
| LC-4 | Successor rooms and teacher access to earlier growth | **moved** to DO-1, DO-2 |
| LC-5 | Growth retention vs the pilot policy | **moved** to DO-7 and LT-1 (Growth Data governance) |
| LC-6 | Growth goals vs deferred mastery labels | Stage 3 deferred; private goals only |
| LC-7 | Teacher view of self-chosen review | Stage 3 deferred; open (OD-L9) |
| LC-8 | What individual competition could exist | open (OD-L8) |
| LC-9 | Review Mode default outside class | open with OD-L3 |
| LC-10 | **New:** Stage 2 "teacher content sharing" and "school administrator layer" are not covered by `docs/pilot/12` (teacher content rows cover a teacher's own puzzles and set transfer only) | needs a data-governance amendment before Stage 2 |
| LC-11 | **New:** "anonymised concept-misunderstanding statistics" (Stage 4) need wrong-answer outcomes, which are not stored today | GM OD-G11; TPS OD-11 |

### 14.3 Open decisions

| # | Decision |
|---|---|
| OD-L3 | Student access model that works in class and, for assigned review, between lessons (LT-2) |
| OD-L5 | Successor room linking (with DO-1) |
| OD-L7 | Cross-class team competition within a school: ever wanted? |
| OD-L8 | Does any form of individual competition remain allowed? |
| OD-L9 | Teacher view of student-selected review (Stage 3) |
| OD-L12 | Thresholds for LT-1 to LT-3 beyond "three uses per term" (for example Review Mode participation rate, delayed recall improvement, clue approval rate) |
| OD-L13 | Scope and powers of the school administrator layer (with TPS OD-14) |
| OD-L14 | Ownership and licence of shared teacher content |
| DO-1 to DO-7 | Data ownership topics before Stage 3 (section 8) |

---

## 15. Review Classification

| Level | Review | Used for this document |
|---|---|---|
| R1 | Internal Project Review | the drafting review (section 14 of the draft) |
| **R2** | **Same-Session Red Team Review** | **yes:** the Red Team Review of 2026-11-02, recorded as same-session, **not** an independent external review. Its text is not stored in the repository |
| R3 | Independent AI or Expert Review | not yet |
| R4 | Teacher / Student Field Validation | not yet; required before effectiveness claims (section 10) |

---

## 16. Change History

| Version | Date | Change |
|---|---|---|
| v1 draft | 2026-11-02 | First draft: sections 1 to 10 and review |
| v1.1 | 2026-11-03 | Section 7 and 8: personal association of Growth Data resolved (persistent internal student identity); DO-1 to DO-7 kept open with their relation to the principle |
| v1 cleanup | 2026-11-02 | Headings aligned to the final structure 1 to 16; supersession note for the draft stage names; Stage 1 status records P2 Acceptance closed |
| v1 | 2026-11-02 | **Conditionally approved.** Stage 1, 2 approved; Stage 3 redefined as Student Agency in Teacher-Governed Learning and Stage 4 as Teacher Community First, both deferred; gates LT-1 to LT-3; KPI correction; data ownership decisions DO-1 to DO-7; strategy areas; scope removals; review classification R1 to R4; Course Room hierarchy |
