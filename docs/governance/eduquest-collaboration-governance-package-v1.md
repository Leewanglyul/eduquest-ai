# EduQuest Collaboration Governance Package v1

Status: **APPROVED by the PM (2026-11-02). Authoritative** for all collaboration-related design, implementation, UX and
analytics decisions (see [README](README.md) for the hierarchy and [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md)).
Documentation only: this package changes no code, schema, flag or deployment.
**Resynchronized 2026-11-02 (v1.1)** with the PM clarifications in section G; where an earlier entry disagrees with
section G, section G wins. **v1.2 (2026-11-02):** communication policy, section H, with the PM decisions on it (H.7).
**Final reconciliation (2026-11-02):** supersessions recorded in section I. **Amended 2026-11-03:** I-12 student identity.

Combines three PM-approved documents:

| Document | Version | Section |
|---|---|---|
| EduQuest Collaboration Vision | v3.0 | B |
| Teacher / Student Information Boundary | v1.0 | C |
| Student Behavior Model | v1.0 | D |

> **Source text pending.** The full text of the three documents was not available when this package was drafted
> (2026-11-02). Sections B, C and D currently record only what is already approved elsewhere in the repository and
> in the PM decisions listed in E.4, each with its source. Insert the approved text of each document in place of the
> marked block; where it differs from a recorded decision, the difference must be listed in E.5 before use.

---

## A. Purpose

1. Fix one set of principles that every collaboration feature (team play, Course Room shared progress, teacher
   dashboard, growth model, team competition modes) must follow, for teacher-operated classroom use by middle- and
   high-school students.
2. State what students may and may not see about each other, and what teachers may see about students.
3. Describe the student behaviour the platform encourages, and the behaviour it must not reward.
4. Record the approved, rejected and deferred features, and the order in which approved work is taken up.
5. Give every later proposal a fixed reference: it cites this package, names any conflict, and explains its alignment
   (constitution, governance rule).

---

## B. Collaboration Vision (v3.0)

> **[Insert the approved text of Collaboration Vision v3.0 here.]**

Recorded principles this section must stay consistent with:

| # | Principle | Source |
|---|---|---|
| B-1 | Value order: Growth > Achievement > Collaboration > Competition | PROJECT_CONSTITUTION |
| B-2 | Students solve a shared puzzle with their team; individual competition is discouraged; team competition happens only when the teacher chooses it | PM direction 2026-10-31; G-4 |
| B-3 | Peer collaboration in the real classroom comes first; Course Room shared progress (or a shared world) and the world restoration narrative are a motivational layer on top | G-7, G-8; E.1 |
| B-4 | Every student has a personal growth loop: improvement compared to one's previous self, measured through recall, review, spaced repetition and personal mastery, not collaborative completion alone | G-5; constitution; docs/product/01 §1 |
| B-5 | Achievement is recognition, not a score: the MVP team achievement "모두 참여 달성" has no points, badges, items or ranking effect | Gate 1 D-3 |
| B-6 | Collaboration is encouraged, never forced | constitution |
| B-7 | Game effects never reduce the readability of cells, clues, numbers or content | CE-11 |

---

## C. Teacher / Student Information Boundary (v1.0)

> **[Insert the approved text of Teacher / Student Information Boundary v1.0 here.]**

Recorded boundary rules this section must stay consistent with:

| # | Students see | Teachers see | Source |
|---|---|---|---|
| C-1 | their own work and their own growth | learning analytics of their Course Room, for instructional support, not direct grading | docs/product/01 principle; E.1 teacher-only analytics; G-6 |
| C-2 | team-level state only: shared grid, team totals of hint and reveal use, whether a help request is open | per-student status, contribution counts, balance indicators, individual resource use | decision #4; G5; E-3 (modified) |
| C-3 | a neutral notice "다른 팀원이 수정했어요": never a name, a writer mark, a count or a ranking | who wrote cells and who earned credit, for diagnosis | E-3 (modified); P3-D1, P3-D2 |
| C-4 | participation only after the team completes, in positive wording only | participation at any time | D-8; P3-D4 |
| C-5 | nothing about who asked for help | that a team asked, never which student | G2; D-9 |
| C-6 | - | a **team-level last-progress timestamp** for classroom operation; no personal stuck time is stored or used to evaluate students; current-clue awareness only as ephemeral live state (no storage, no analytics, discarded after the session, no performance inference); no focus tracking | G1 as amended (I-2, I-3) |
| C-7 | - | data is never used for grading, ranking or discipline, and is not exported | G3 |
| C-8 | - | access is Course Room scoped: owner and co-teachers; the school admin reads only (implemented today as the classroom) | TV-1; D-1; G-3 |

---

## D. Student Behavior Model (v1.0)

> **[Insert the approved text of Student Behavior Model v1.0 here.]**

**Status of the model (PM, 2026-11-02):** the Student Behavior Model is a **design hypothesis and a teacher observation
framework**. Domination, follower behaviour and leadership type are **not** turned into automated dashboard metrics in
the MVP (I-1).

Recorded behaviour rules this section must stay consistent with:

| # | Encouraged | Not rewarded or not possible | Source |
|---|---|---|---|
| D-1 | every member contributes at least one solved clue (recognised as "모두 참여 달성") | out-competing teammates; contribution counts are not shown to students | decision #1; D-3; E-3 |
| D-2 | asking for help as a team with one fixed button; coordinating with teammates through structured collaboration signals and shared-action Jigsaw actions | free-text messages, social chat, private or direct messages | G2; H |
| D-3 | using hints to learn (초성, one-letter reveal, checks within a shared team budget) | hints that hand over whole answers; unlimited checking | D-6; E-1 |
| D-4 | contributing to the shared result | taking over or "flipping" other students' work | E.1 (Othello-style flipping rejected) |
| D-5 | recall that improves over time for the student personally | comparison with classmates | constitution; E.1 |
| D-6 | late joining a team: allowed, with no inherited credit | removal or moving a student out of a started team | D-3 (P2), D-10 |

---

## E. Approved Decisions

### E.1 Approved

- Course Room shared progress (Course Room shared world); replaces "class-wide shared world" (G-8)
- Personal growth loop
- Teacher-only analytics
- Anonymous support requests
- Shared-action Jigsaw (as clue-sharing game actions, H.4)
- World restoration narrative
- Structured Collaboration Signals (H)
- Quick Messages (H.2)
- Teacher-Defined Signals (H.2)
- Clue-Sharing Game Actions (Shared-Action Jigsaw, H.4)

### E.2 Rejected

- Student rankings
- Student contribution rankings
- Student-colored solved words
- Othello-style area flipping
- Contribution-based grading
- Open Chat (for MVP, H.6)
- Private Messaging (for MVP, H.6)
- Direct Student-to-Student Messaging (for MVP, H.6)
- Unrestricted Social Chat (for MVP, H.6)

### E.3 Deferred

- 4v4 team battle
- School vs school
- Advanced avatar economy
- Teacher-enabled limited free-text team chat (H.6, I-7)

Team competition as a mode is **allowed** (G-4); the formats above stay deferred.

### E.4 Earlier approved decisions this package builds on

| Area | Decisions | Where recorded |
|---|---|---|
| Collaboration governance | K15, K17 (modified), K23; G1 to G5; retention 30 days | docs/m2/06 §11.9, §12.5, §12.7; PM 2026-10-31 |
| Collaboration MVP design | Gate 1 (Rev 2 baseline), D-3 recognition only, decisions #1 to #6 | M3 design doc, Gate 1 tab |
| Gate 2 | E-1 (b), E-2 (a), E-3 (modified), E-4 to E-6 (a), E-8 (b), E-9 (a) | Gate 2 package doc |
| P1 schema | play mode, team tables, cell writers, solves, credits, help requests | migrations 20261101000001/2 |
| P2 functions | D-1 to D-10 (D-10: a credit is a historical fact) | migrations 20261102000001/2 |
| P3 team play | P3-D1 to P3-D8 approved; D9 notice limit (UX) | P3 packages |
| Learning visibility | CE-11 | docs/m2/06 §12 |

### E.4a Design-level decisions (Design Vision v1, conditionally approved 2026-11-02)

| Topic | Decision | Where |
|---|---|---|
| Combo | team combo only; no individual combo; consecutive team solves, not time; never show who caused a combo | [Design Vision](design-vision-v1.md) 3.1 |
| Growth | official model **Encountered → Recall → Retained** (minimum retention interval 7 days); collaborative play records encounters; personal recall raises mastery; explanation stage deferred; Review Mode on by default; growth never affects scores, competition or combos | [Growth Model and Mastery v1](growth-model-and-mastery-v1.md); Design Vision 3.2; I-5 |
| Badges | private by default; no speed, rank, most-solved or activity-volume badges; no badge based on signals; the personal clue-sharing badge and mastery-label badges are deferred | Design Vision 3.3; I-4, I-5 |
| Characters | prototype comparison: restrained animal symbol, abstract emblem or call sign, no-character option (supersedes the earlier animal-material decision) | Design Vision 3.4; I-8 |

The earlier conflict between a personal clue-sharing badge and team-level signal data (Design Vision DV-7) is resolved
by I-4: signals and clue-sharing game actions are separate, and the personal badge is deferred.

### E.5 Differences between the source documents and E.4

> To be completed when the source texts are inserted. Open questions found while drafting: see the review notes in
> the commit that adds this package.

---

## F. Implementation Priorities

| Priority | Work |
|---|---|
| 1 | Teacher Package · Teacher Dashboard · Growth Model · Course Room Shared Progress |
| 2 | P3 Team Play · Gate 3 · Structured Collaboration Signals (after the first Gate 3, in the Live Collaboration Presence Package, H-15) |
| 3 | Personal Dictionary · Spaced Repetition · Shared-action Jigsaw |
| 4 | Competitive Modes |

Rules:

1. A priority sets the order in which work is **proposed**. Each item still needs its own package, PM approval and gate.
2. Items already approved or in flight (P1 and P2 applied or approved; P3 packages approved as plans) keep their
   approvals; this list orders what is taken up next.
3. Rejected items (E.2) are not proposed again without a new PM decision that amends this package.
4. Deferred items (E.3) are not designed until the PM reopens them.

---

## G. PM clarifications (2026-11-02)

These supersede earlier assumptions in this package and in lower-level documents.

| # | Clarification |
|---|---|
| G-1 | **Primary users:** middle-school students; high-school students second; teachers are first-class users. Elementary-school assumptions do not drive governance decisions |
| G-2 | **Environment:** teacher-operated classroom, not an open online social platform. Teacher → Course Room → teams → students; the teacher is present and may intervene |
| G-3 | **Course Room** is the official unit (classroom, elective course, high-school credit course, club, workshop) and replaces classroom-specific assumptions |
| G-4 | **Competition:** individual competition discouraged; teacher-controlled team competition allowed. The teacher chooses collaboration mode, challenge mode or team competition mode by instructional goal. Competition is configurable, not prohibited |
| G-5 | **Growth** (unchanged): improvement compared to one's previous self, measured through recall, review, spaced repetition and personal mastery, not collaborative completion alone |
| G-6 | **Teacher Dashboard** is a core feature: intervention tools, progress monitoring, help requests, concept understanding signals. Its data is for instructional support, not direct grading |
| G-7 | **Collaboration** prioritizes real classroom interaction over fictional world-building; world-building may exist as a motivational layer |
| G-8 | **Shared progress:** "Course Room shared progress" or "Course Room shared world" replaces "class-wide shared world" |
| G-9 | **Superseded in part by I-12 (2026-11-03).** **Student identification:** teacher roster → QR join → student name selection → session join. Anonymous nicknames are not the preferred long-term model |
| G-10 | **Communication:** revised 2026-11-02, see section H. Structured collaboration signals are approved; free text team chat is deferred; open, private and direct messaging and unrestricted social chat are rejected for the MVP. (Replaces the earlier "Chat: DEFERRED", whose text was cut off) |

Open points created by these clarifications: see [teacher-dashboard-and-classroom-operations-v1.md](teacher-dashboard-and-classroom-operations-v1.md) section J.

---

## H. Structured Collaboration Signals (PM decision, 2026-11-02)

### H.1 Principle

EduQuest supports **structured collaboration inside teacher-operated classroom activities**, not unrestricted social
chat. Students do not type arbitrary messages; they communicate through predefined educational signals and actions.
**Structured Collaboration Signals are instructional collaboration tools. They are not considered chat.** The approach follows an earlier educational escape-room project in
which restricted communication worked well.

Why a digital layer matters: students may be working quietly, told not to speak, on mixed devices, or (in future
phases) remote.

Communication tools exist to support **collaboration, clue sharing and coordination**. They do **not** exist to support
social networking, casual conversation, ranking or competition.

### H.2 What students may use

| Kind | Meaning |
|---|---|
| Quick messages | a fixed list of short educational messages |
| Teacher-defined signals | a signal set the teacher chooses from predefined approved lists; no teacher free text (H-9) |
| Collaboration actions | actions on the shared puzzle that tell teammates something |
| Clue-sharing game actions | **not a signal:** a separate kind of action (H.4) |
| Help-request actions | the team help request to the teacher (G2, D-9): a **separate interaction type**, not a team signal (H-8) |

Approved examples: Help needed · Check this clue · I can help here · Please look at this word · Clue shared · Hint
requested · Good idea · Let's check the intersection. Korean wording is set in the feature package.

### H.3 Teacher controls

If signals are implemented, the teacher must be able to:

1. enable or disable signals;
2. choose a signal set from the predefined approved lists;
3. review aggregate collaboration activity.

A full chat moderation system is not needed, because no free text exists to moderate.

### H.4 Clue-Sharing Game Actions (Shared-Action Jigsaw)

Separate from structured collaboration signals (I-4). Clue-sharing game actions are game actions on the puzzle, not
chat messages: share a picture clue, share an initial-letter clue, share an example sentence, reveal a supporting
clue. They **do not consume the hint budget** (H-10).

| | Structured Collaboration Signals | Clue-Sharing Game Actions |
|---|---|---|
| What | predefined messages and teacher-defined signals | game actions that share a clue |
| Storage | team-level aggregation only (H-11) | no durable personal storage until a later Growth / Data Governance decision |
| Feedback to the student | none beyond the team notice | may give **one-time private impact feedback** (for example that a shared clue helped the team), not stored |
| Basis for a personal badge | **never** | not until the later decision; the permanent personal clue-sharing badge is deferred |

### H.5 Rules carried over from approved decisions

| # | Rule | Source |
|---|---|---|
| H-1 | No free text from students, anywhere | G2; H.1 |
| H-2 | Signals stay inside the student's own team and activity; no messages to other teams or to individual students | H.6 |
| H-3 | The help request to the teacher stays anonymous and team-level, one open per team, 60 s cooldown | G2; P2 D-9 |
| H-4 | Signals never show rankings, scores or counts to students | constitution rule 4; C-2 |
| H-5 | Signals appear in the status area, one visible notice at a time, and never cover cells, clues or numbers | CE-11; P3 D9 |
| H-6 | Signal activity shown to teachers is for instructional support, not grading or discipline | G3; G-6 |

### H.7 PM decisions (2026-11-02)

| # | Decision | Resolves |
|---|---|---|
| H-7 | Signals are **anonymous**: students never see sender names | J-10 |
| H-8 | Team signals and teacher help requests are **separate interaction types** | J-11 |
| H-9 | Teacher-defined signals come **only from predefined approved lists**; no teacher free-text messages | J-13 |
| H-10 | Clue-sharing game actions (Shared-Action Jigsaw) **do not consume the hint budget** | J-12 |
| H-11 | Signal activity is stored **only at team level**; per-student signal counts are neither stored nor exposed; signals are never the basis of a personal badge (I-4) | J-14 |
| H-12 | Signals are **rate limited**. Default: one visible signal per team, 10 s cooldown | J-15 |
| H-13 | Structured Collaboration Signals are **Priority 2** (section F) | J-16 |
| H-14 | Teacher-enabled limited free-text team chat remains **Deferred** (I-7) | - |
| H-15 | Structured Collaboration Signals are **not in the first Gate 3**. Ask Team and anonymous current-clue awareness are deferred to a separate **Live Collaboration Presence Package** (Future Priority 2, not rejected); no signal storage until then | Gate 3 scope, TPS 7.1 |

### H.6 Status

| Status | Item |
|---|---|
| Approved | Structured Collaboration Signals · Quick Messages · Teacher-Defined Signals · Clue-Sharing Game Actions (Shared-Action Jigsaw) |
| Deferred | Teacher-enabled limited free-text team chat |
| Rejected (for MVP) | Open Chat · Private Messaging · Direct Student-to-Student Messaging · Unrestricted Social Chat |

Open points: see [teacher-dashboard-and-classroom-operations-v1.md](teacher-dashboard-and-classroom-operations-v1.md)
section J (J-10 to J-16, all decided in H.7).

---

## I. Supersession record (PM final reconciliation, 2026-11-02)

Each entry replaces the earlier position everywhere in the governance documents.

| # | Topic | Earlier position | Current position |
|---|---|---|---|
| I-1 | Student Behavior Model | approved model, use not specified | a design hypothesis and teacher observation framework; no automated domination, follower or leadership metrics in the MVP |
| I-2 | Stuck-time and progress timing (G1) | no focus, stuck-time or current-clue tracking | a **team-level last-progress timestamp** is allowed for classroom operation; personal stuck time is not stored and never used for student evaluation |
| I-3 | Current-clue awareness (G1) | not allowed | allowed only as **ephemeral live state**: no durable storage, no analytics, discarded after the session, no student-performance inference |
| I-4 | Signals and clue sharing | Shared-Action Jigsaw treated as signal communication | two kinds: **Structured Collaboration Signals** (team-level only, never a badge basis) and **Clue-Sharing Game Actions** (one-time private impact feedback; durable personal storage needs a later Growth / Data Governance decision); the permanent personal clue-sharing badge is deferred |
| I-5 | Mastery model | mastery stages incl. explanation mastery | **Encountered → Recall → Retained** (Growth Model v1, approved; earlier names Personal Recall Success and Delayed Recall Success); explanation stage, full mastery labels and related badges deferred |
| I-6 | Five-Minute Rule success | every present student's first input | **every team started** within 10 minutes (first use) or 5 minutes (repeat use); supporting metric: at least 90 % of present students made a first input; external device faults logged separately (OX-1) |
| I-7 | Chat | an earlier approval of team free-text chat | **superseded.** Structured signals and Shared-Action Jigsaw are approved; teacher-enabled limited free-text team chat remains deferred; open chat and direct messages remain rejected |
| I-8 | Characters | animal material may remain | **superseded** by prototype comparison: restrained animal symbol, abstract emblem or call sign, no-character option |
| I-9 | Constitution rules 4 and 5 | "rankings are prohibited", "direct student comparison is prohibited" | individual student rankings and direct individual comparison are prohibited; teacher-configured team comparison may be enabled for instructional purposes under projection safety (OX-12) |
| I-11 | First Gate 3 scope | signals and live presence assumed in Gate 3 | excluded: Ask Team, current-clue awareness, Realtime, Migration C; the in-class view shows student state, team help state, blocked state and close only; per-student balance excluded from the MVP (TPS 7.1) |
| I-10 | Teacher Dashboard during class | team progress view, per-student detail | during class only: teacher help calls, operationally blocked teams, missing / not-started students, time and intervention controls, session status; analysis moves to post-session |
| I-12 | Student identity (PM, 2026-11-03) | G-9: teacher roster → QR join → student name selection → session join; anonymous nicknames not preferred | **Student identity is persistent and personal**; personal growth records are associated with the persistent internal student identity (constitution). **Superseded:** anonymous nickname identity is not the long-term identity model; name-selection-only identity is not the long-term identity model. **Reinterpreted:** QR codes and join links remain, as access conveniences only, never the identity. **Direction:** persistent individual accounts. Cross-Course-Room access, successor-teacher access, transfer, retention, student or guardian access, erasure and merging are not approved by this entry |
