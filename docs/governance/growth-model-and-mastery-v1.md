# Growth Model and Mastery Specification v1

Status: **APPROVED by the PM (2026-11-02)**, with decisions GM-1 to GM-5. Documentation only: no code, schema, flag
or deployment change. Every record this document describes is **future**: none exists, and none may be built before
the data-governance amendment in section 8.

**Official model:** **Encountered → Recall → Retained.** The explanation stage is deferred.

Must comply with: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) (**CON**, rule 3: growth is measured through
personal recall) · [Collaboration Governance Package v1.2](eduquest-collaboration-governance-package-v1.md) (**PKG**,
G-5, H.4, I-4, I-5) · [Teacher Dashboard and Classroom Operations](teacher-dashboard-and-classroom-operations-v1.md)
(**OPS**, H) · [Teacher Package Specification](teacher-package-specification-v1.md) (**TPS**) ·
[Operational UX Principles](operational-ux-principles-v1.md) (**OX**, OX-13) · [Design Vision v1](design-vision-v1.md)
(**DV**, 3.2, 3.3). Supersedes, where they differ, the growth measures and achievement examples of
[docs/product/01](../product/01-student-learning-profile.md) §4 and §5 (see C-3).

---

## 1. Growth Philosophy

> **Collaboration creates opportunities for learning.
> Personal recall provides evidence that learning remained.**

1. **Growth is not collaborative completion.** A team finishing a puzzle is an achievement of the team; it says
   nothing reliable about what each member can now recall (OPS H-2).
2. **Growth is improvement compared to one's previous self** (PKG G-5): a word the student could not recall before,
   and can recall now, and still can later.
3. **Growth requires evidence of recall.** Only an observed, unassisted recall by the student counts. Playing,
   clicking, logging in, time spent and team solves do not (DV 3.2).
4. **Mistakes are safe** (DV P-8): a failed recall is information for review, never a loss, a penalty or a public fact.
5. **Growth is private** to the student, and to their teachers for diagnosis (section 9); it is never compared between
   students (CON rules 4, 5 as interpreted, PKG I-9).
6. **Growth outcomes never affect scores, never affect competition and never affect combo systems.** Growth and play
   results are separate worlds: no growth stage, recall or badge feeds a team score, a competition result or a combo
   (DV 3.1).

---

## 2. Word Lifecycle

### 2.1 Alternatives evaluated

| Option | Stages | Strengths | Weaknesses |
|---|---|---|---|
| **A. Five stages** (PM example) | Encountered → Reviewed → Recall Success → Retained → Mastery | complete story | "Reviewed" is an activity, not evidence (anyone can look at a word); "Mastery" needs a definition that does not yet exist (deferred, PKG I-5) |
| **B. Three evidence stages** (approved initial model, PKG I-5; **adopted**) | Encountered → Recall → Retained | every stage is a fact the system can observe; matches the approved model; no inflation from activity | no "end" stage; review scheduling must be handled separately |
| **C. Hidden strength score** (Leitner box or memory-strength number) | a number per word, shown as stages | best for scheduling reviews | a number invites gamification and comparison; hard to explain to students and teachers |
| **D. Two states** (Seen / Recalled) | Seen → Recalled | simplest | cannot tell short-term from lasting recall, which is the core of growth |

### 2.2 Official model (PM approved)

**Encountered → Recall → Retained** (option B) for everything the student and teacher see, plus an **internal review
step (from option C)** used only to schedule spaced repetition and never shown as a level or number.

| Stage | Means | Reached by |
|---|---|---|
| Encountered | the word was in front of the student | playing a puzzle that contains it (individual or team) |
| Recall | the student produced it alone | a recall success (3.2) |
| Retained | the student still produced it later | a recall success at least 7 days after the last one (3.3, GM-1) |

```
Encountered ──(personal recall, hint-free)──▶ Recall ──(recall again after the delay)──▶ Retained
     ▲                                                     │                                               │
     └──────────── failed recall: the stage stays; the word comes back for review sooner ◀─────────────────┘
```

- **Stages only move forward** in what the student sees. A failed recall does not lower the visible stage (safe
  mistakes); it shortens the internal review interval so the word returns sooner.
- "Reviewed" is not a stage; review is the activity that produces recall evidence.
- The explanation stage is deferred (section 6.2).

---

## 3. Recall Rules

### 3.1 What counts as a recall attempt

A **recall attempt** for a word happens when the student plays the word **alone**: in Individual Check mode (TPS
section 4) or a personal review session (section 3.4). Team modes never produce recall attempts (section 4).

| Outcome of the attempt | Condition (per word) |
|---|---|
| **Recall success** | the student's own entry is correct when the attempt is submitted, with **no reveal and no 초성** used on that word, and with fewer than half of its letters given (prefill) |
| **Assisted** | correct, but a reveal or 초성 was used on the word, or half or more of its letters were given |
| **Not recalled** | not correct at submission (empty or wrong) |

Check use (letter verification) on the word: open decision OD-G3 (counts as assisted, or allowed once).

### 3.2 Immediate recall

A recall success **in the same session or within 24 hours** of the word's first encounter, or of the last attempt.
Effect: Encountered → **Recall**. A second immediate success does not move the word further.

### 3.3 Delayed recall

A recall success **at least the minimum delay after the last recall success**, in a **later session** and in a
**different puzzle** (different grid, so the student cannot recall a position instead of the word).
Minimum retention interval: **7 days** (GM-1). Effect: Recall → **Retained**.

### 3.4 Spaced repetition

An internal interval per word decides when it is **due** for review. Proposal for the intervals other than the
7-day minimum of GM-1 (Leitner-style, OD-G2):

| After | Next review due in |
|---|---|
| encounter | 1 day |
| first recall success | 7 days |
| each further success | 14, then 30 days |
| not recalled | back to 1 day (the visible stage is kept) |

Due words reach the student through:
1. **Teacher-run Individual Check** sessions (the teacher picks a puzzle; due words are what a teacher may want to
   include, TPS section 9 "After class" step 4);
2. **Review Mode** (3.6), built from the student's due words.

### 3.5 Events that increase mastery

| Increases | Does not increase |
|---|---|
| a recall success in Individual Check or Review Mode (3.2, 3.3, 3.6) | team solves, credits, being the writer of a cell (P2) |
| | clue-sharing game actions (PKG H.4, I-4) and signals (H-11) |
| | clicks, logins, time spent, number of puzzles played (DV 3.2) |
| | assisted outcomes; replaying the same grid within the delay |

At most **one recall attempt per word per day** counts (farming guard, section 10).

The reverse also holds: growth outcomes never change scores, competition results or combos (section 1, item 6).

### 3.6 Review Mode (GM-2 to GM-5)

A short personal review that gives due words a chance to move to Recall or Retained.

| # | Decision | Value |
|---|---|---|
| GM-2 | Number of questions | **5 to 10**, default **7** |
| GM-3 | Default review time | **4 minutes** |
| GM-4 | Question mix | **80 % current unit**, **20 % previous units** |
| GM-5 | Review Mode default | **ON** |

Rules carried over from approved governance:
- Played **alone**: every answer is a recall attempt under 3.1 (success, assisted, not recalled).
- Questions come only from words the student has **encountered**, taken from already published and reviewed content, so
  no new teacher review is needed (OX-6, low risk).
- No speed element: the review time is a session length, not a score; finishing faster earns nothing (DV 3.3).
- Results are private (section 9) and never affect scores, competition or combos (section 1).
- When a student has no previous units yet, all questions come from the current unit.


---

## 4. Collaborative Learning Transfer

**A collaborative solve never increases mastery by itself.**

How a word met in team play becomes personal growth:

1. **Encounter.** Every word of a team puzzle is recorded as **Encountered** for each member who belonged to the team
   while the attempt was open (P2 membership; a late joiner encounters the words from joining; no credit is
   inherited, D-10). Encounter needs no solve and no input: it means "this word was in front of you".
2. **Queue.** Encountered words become due for review after 1 day (3.4).
3. **Personal recall.** The word reaches Recall only when the student recalls it alone later
   (Individual Check or personal review).
4. **Teacher bridge.** The intended classroom loop is: team play to understand → teacher explanation of the hardest
   words (TPS section 8) → a later Individual Check to see personal recall (TPS section 9).

Team-play data used: membership and the puzzle's word list only. **Not used:** who wrote which cell, credits, solves,
signals, clue-sharing actions. Clue sharing may give a one-time private impact feedback at the moment it happens
(PKG H.4), which is not stored and not part of growth.

---

## 5. Dictionary Model

The **personal dictionary** is the student's collection of words and their state. The record layer is needed for the
Growth Model (Priority 1); the student-facing dictionary screen is Priority 3 (PKG F, "Personal Dictionary").

| Part | Content | Not stored |
|---|---|---|
| **Word collection** | one entry per word the student encountered: the word, its clue and meaning from the published puzzle version where it was first met, date first encountered, the Course Room | the student's typed letters |
| **Mastery state** | current stage (section 2), internal review interval and due date | any score or level number shown to the student |
| **Review history** | per recall attempt: date, outcome (success / assisted / not recalled), mode (Individual Check or review) | wrong letters, keystrokes, time per word, current clue (I-3) |
| **Ownership** | the entry belongs to the **student**; it follows the student across Course Rooms of the same school | - |

Privacy rules:
- The student sees their whole dictionary, in plain Korean, with what each stage means (product/01 §6.2 rule 7).
- **No classmate ever sees any part of it** (PKG C-1, C-2).
- Teachers see it only as defined in section 9.
- Never used for grading, ranking, placement or discipline (G3); not exported.
- Every entry cascades from the student and is deleted with the student's data (G4, section 8).
- Puzzle versions are immutable, so the clue and meaning can be referenced, not copied; if the content is deleted,
  the entry keeps only the word (OD-G6).

---

## 6. Mastery Levels

### 6.1 Minimum viable levels

| Level | Shown to the student as (draft wording) |
|---|---|
| Encountered | 만난 단어 |
| Recall | 스스로 떠올린 단어 |
| Retained | 시간이 지나도 기억한 단어 |

The growth gauge shows how many of the student's words are in each level, and how that changed since the student's
earlier sessions. No points, no XP, no level number for the student, no streaks.

### 6.2 Future expansion (deferred)

| Candidate | Condition (sketch) | Why deferred |
|---|---|---|
| Explanation | the student can explain or use the word (sentence, meaning) | **deferred by the PM**; needs new item types and a judgement rule; deferred with its badge |
| Needs review | shown when a word is long overdue | risk of reading as a failure; wording needs student validation |
| Topic-level growth | stages grouped by content set or topic | needs topic metadata in content |

---

## 7. Badges and Recognition

| Concept | Status | Why |
|---|---|---|
| Personal recall without hints (first recall success) | **Approved** (DV 3.3) | direct evidence of recall; reachable by everyone |
| Successful recall of a previously missed word | **Approved, data-dependent** (DV 3.3) | rewards learning from mistakes (P-8); needs the "not recalled" outcome in the review history (C-2) |
| First Retained word | **Proposed** (OD-G5) | evidence of lasting recall; the lasting-growth milestone while the explanation stage is deferred |
| First word reaching the explanation stage | **Deferred** (PKG I-5) | the stage is deferred |
| Full mastery label badges | **Deferred** (PKG I-5) | labels are deferred |
| Helping a team through clue sharing (permanent personal badge) | **Deferred** (PKG I-4) | no durable personal clue-sharing record until a later decision |
| Speed, rank, most solved, activity volume | **Rejected** (DV 3.3) | reward pace, comparison or quantity, not recall |
| Any badge based on structured signals | **Rejected** (PKG I-4, H-11) | signals are team-level only |
| Login streaks, "five puzzles in a month", "improved your time" (product/01 §4 examples) | **Rejected** | activity volume and speed (DV 3.2, 3.3) |
| Team "모두 참여 달성" | unchanged: team **recognition**, not a badge, no points (D-3) | |

All badges are **private by default** (DV 3.3), never lost, never shown on projected screens (OX-12), and versioned
rules (product/01 §4).

---

## 8. Retention and Data

| Topic | Rule |
|---|---|
| **Storage purpose** | the student's personal learning record and the scheduling of spaced repetition; teacher diagnosis (section 9) |
| **Retention expectation** | growth needs time: at least a **course term**, ideally the **school year**, and across the student's Course Rooms in the same school |
| **Deletion: student erasure** | dictionary, stages and review history are deleted with the student (cascade, G4) |
| **Deletion: student leaves a Course Room** | entries stay with the student (they belong to the student); the teacher of that room loses access (section 9) |
| **Deletion: year end** | handled by the year-end procedure of OX-9 (keep, archive or delete per category) |
| **Deletion: content deleted** | the entry keeps the word only (OD-G6) |
| **Derived from attempts** | recall outcomes are extracted when an attempt is submitted, so they survive the attempt's own retention |

**Growth data and operational data have separate retention policies** (PM decision):

| Category | Examples | Retention |
|---|---|---|
| **Growth data** | dictionary entries, stages, review history, badges, review-interval state | its own policy, long enough for growth over a term or year (OD-G9); deleted with the student |
| **Operational data** | attempts, team membership, solves and credits, help requests, signal counts, session state, last-progress timestamps | the operational policy (`docs/pilot/12` today); not extended for growth purposes |

A growth record never keeps an operational record alive: only the derived outcome (date, word, result) is kept as
growth data.

Conflicts with existing policies:

| # | Conflict | Policy |
|---|---|---|
| R-1 | Pilot data is **deleted no later than 30 days after the pilot end date** (`docs/pilot/12` §2); a term- or year-long growth record cannot exist inside the pilot policy | `docs/pilot/12` §2; product/01 §6.2 rule 5 |
| R-2 | The 30-day retention recorded for collaboration data (PKG E.4) would delete team attempts before a delayed recall is due; only membership-derived encounters must be kept | PKG E.4; UX-8; DV-9 |
| R-3 | **Per-word outcomes are deliberately not stored** today; the review history stores per-word outcomes (without letters) | product/01 §3, §8; docs/m2/13 §1.3; TPS OD-11 |
| R-4 | The personal dictionary, stages, review history and badges are **new data categories**; none may be built before `docs/pilot/12` and `13` are amended and re-signed | product/01 §6.2 rule 9; OX-13 |
| R-5 | The dictionary follows the student across Course Rooms, while teacher access is Course Room scoped | PKG C-8 |

---

## 9. Teacher View

Post-session only (PKG I-10); never during class.

| A teacher may see (own Course Room only) | Must remain private |
|---|---|
| per student: number of words in each stage, for words met in **this** Course Room | everything from other Course Rooms (other subjects, other teachers) |
| per word (class level): how many students reached each stage, for concept review (TPS section 8) | the student's review history in detail (dates and outcomes per attempt) unless the PM decides otherwise (OD-G7) |
| words due for review across the room, to plan an Individual Check | badges, unless the PM decides teachers see them (OD-G8) |
| | any ordering of students by mastery; lists stay in roster order (TV-1 M-7) |
| | nothing is ever shown to classmates or on a projected screen (OX-12) |

Teacher figures are for instructional support: never grades, ranking or discipline (G3); not exported. The view states
what it measures: vocabulary recall in a crossword format, not the student as a person (product/01 §1).

---

## 10. Failure Modes

| Failure | How it happens | Mitigation |
|---|---|---|
| **False mastery** | guessing with checks; many given letters; very short words; recalling a grid position | check use per OD-G3; prefill threshold (3.1); delayed recall needs a different puzzle (3.3) |
| **Mastery inflation** | replaying the same puzzle; many immediate attempts | one counted attempt per word per day (3.5); immediate successes do not stack (3.2) |
| **Passive participation** | a team member never types but "learns" through the team | team play gives Encountered only (section 4); recall has to be personal; the teacher sees participation post-session, never as a student ranking |
| **Farming** | replaying easy puzzles for badges or stage counts | badges are first-time only; no volume badges (section 7); daily cap |
| **Copying in the room** | looking at a neighbour's screen during Individual Check | teacher-run activity; different grids or word order per student when personal review exists; no high-stakes use (G3) |
| **Spelling without meaning** | the crossword tests recall of the form from a clue | the clue carries meaning; the explanation stage is deferred for exactly this reason; the view says what it measures |
| **Discouragement** | slow progress with occasional use; failed recalls | stages never go down; encouraging wording; "더 풀어 보면 알 수 있어요" for small samples (product/01 §5) |
| **Misuse as a grade** | a teacher exports or copies numbers into marks | no export; wording "학습 지원용, 성적 아님"; G3 |
| **Data loss before delayed recall** | retention deletes attempts before the 7-day check | extract recall outcomes at submission (section 8); R-1, R-2 |

---

## A. Summary

*Collaboration creates opportunities for learning. Personal recall provides evidence that learning remained.*

Growth is personal, evidence-based recall over time. Team play introduces words (Encountered) but never raises
mastery; only a hint-free recall by the student alone does (Recall), and only a recall repeated at least 7 days
later in a different puzzle shows lasting growth (Retained). Review Mode (7 questions, 4 minutes, 80 / 20 current and
previous units, on by default) gives due words that chance. Growth never affects scores, competition or combos, and
growth data has its own retention policy, separate from operational data. A hidden review interval schedules spaced
repetition. The personal dictionary holds the words, their stage and a minimal outcome history without letters; it
belongs to the student, is private from classmates, and is visible to teachers only as post-session aggregates for
their own Course Room.

## B. Proposed mastery model

**Encountered → Recall → Retained** (approved), forward-only for display, minimum retention interval 7 days (GM-1),
with an internal Leitner-style interval for review scheduling. The explanation stage is deferred.

## C. Conflicts found

| # | Conflict |
|---|---|
| C-1 | Retention: pilot deletion 30 days after pilot end, and the 30-day collaboration retention, vs a term- or year-long growth record (R-1, R-2). The separate growth retention policy is approved in principle; its period is open (OD-G9) |
| C-2 | Per-word outcomes deliberately not stored vs the review history and the "previously missed word" badge (R-3) |
| C-3 | `docs/product/01` §5 measures growth by speed, persistence and reach, and §4 lists "improved your time", "five puzzles in a month"; DV 3.2 and 3.3 exclude speed and activity volume. product/01 also still says other students see nicknames (superseded, OPS J-5) |
| C-4 | The dictionary spans Course Rooms while teacher access is per Course Room (R-5) |
| C-5 | The record layer is needed in Priority 1, the personal dictionary is listed in Priority 3 (PKG F) |
| C-6 | Delayed recall needs a different puzzle with the same word; today puzzles are teacher-assigned to the whole room, and personal puzzles need generation and review rules (OX-6) |
| C-7 | TV-1 records per-word help events but no per-word correctness; recall outcomes need the submitted per-word result, which the play functions compute but do not store |
| C-8 | Review Mode default ON vs the Five-Minute Rule (OX-1): a 4-minute review before play would use most of the repeat-use target | OX-1 |
| C-9 | Review Mode is approved now, while Spaced Repetition is listed in Priority 3 (PKG F) | PKG F |
| C-10 | "Current unit" and "previous units" are not defined in the content model (content sets, puzzles, Course Room assignments) | content pipeline (`docs/m2/01`) |

## D. Governance implications

1. `docs/pilot/12` and `13`: new categories (dictionary entries, stages, review history, badges), a new purpose
   (personal learning record and review scheduling), a retention period beyond the pilot window, and the deletion
   order; re-signature (product/01 §6.2 rule 9).
2. A **post-pilot retention policy** is needed for growth to mean anything (C-1).
3. `docs/product/01` §4 and §5 marked superseded where they differ (C-3).
4. PKG F: split the Personal Dictionary into a record layer (with the Growth Model) and a student screen (Priority 3)
   (C-5).
5. A later Growth / Data Governance decision on durable personal clue-sharing records (PKG I-4) stays open; this model
   does not need it.

## E. Open decisions requiring PM review

| # | Decision |
|---|---|
| OD-G1 | ~~Adopt option B~~ **Decided:** Encountered → Recall → Retained |
| OD-G2 | Immediate window 24 h and the review intervals 1 / 14 / 30 days (the 7-day minimum is decided, GM-1) |
| OD-G3 | Does using check on a word make the outcome "assisted"? |
| OD-G4 | Prefill threshold for a recall to count (proposal: fewer than half the letters given) |
| OD-G5 | Add a "first Retained" badge? |
| OD-G6 | When content is deleted, keep the word in the dictionary or remove the entry? |
| OD-G7 | May teachers see a student's per-attempt review history, or only stage counts? |
| OD-G8 | May teachers see a student's badges ("private by default" applies to classmates only, or to teachers too)? |
| OD-G9 | Retention period of growth records after the pilot (term, school year, or while enrolled) (C-1) |
| OD-G10 | Do encounters from Course Room A appear in the dictionary when the student plays in Course Room B, and does teacher B see them (C-4)? |
| OD-G11 | Store per-word outcomes (success / assisted / not recalled, no letters) as a new data category (C-2, C-7)? |
| OD-G12 | Review Mode question format (crossword mini-grid, clue → word, or both) |
| OD-G13 | When Review Mode runs (before play, after play, or as its own activity) and whether its time counts against OX-1 (C-8) |
| OD-G14 | Who switches Review Mode (the default is ON): the teacher per Course Room, per assignment, or both |
| OD-G15 | Definition of "unit" for the 80 / 20 mix (C-10) |
| OD-G16 | Is a visible countdown shown during the 4 minutes, given the no-speed principle? |
| OD-G17 | Priority of Review Mode: with the Growth Model (Priority 1) or with Spaced Repetition (Priority 3) (C-9) |

---

## Changes

| Version | Date | Change |
|---|---|---|
| v1 draft | 2026-11-02 | First draft, sections 1 to 10 and outputs A to E |
| v1 | 2026-11-02 | **Approved.** Official model Encountered → Recall → Retained; explanation deferred; GM-1 to GM-5 (Review Mode); growth never affects scores, competition or combos; separate retention for growth and operational data; philosophy statement |
