# Design Vision v1

Status: **CONDITIONALLY APPROVED by the PM (2026-11-02).** The direction-level principles (section 2) and the design
decisions (section 3) are approved. **Visual expression remains provisional until student validation** (section 4).
Documentation only: no code, schema, flag or deployment change. **Not a UI specification:** no colours, no layouts,
no components.

Must comply with: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) (**CON**) ·
[Collaboration Governance Package v1.2](eduquest-collaboration-governance-package-v1.md) (**PKG**) ·
[Teacher Dashboard and Classroom Operations v1.2](teacher-dashboard-and-classroom-operations-v1.md) (**OPS**) ·
[Teacher Package Specification v1.0](teacher-package-specification-v1.md) (**TPS**) ·
[Operational UX Principles v1.0](operational-ux-principles-v1.md) (**OX**).

**Operational separation.** Teacher-operated classroom rules and teacher-controlled team competition are defined in
[Operational UX Principles](operational-ux-principles-v1.md) (and OPS, TPS). This document only references them.

---

## 1. Target users and design goal

| Group | Role in the design |
|---|---|
| **Middle-school students** | primary: the design is judged first by whether it fits them |
| **High-school students** | secondary: the design must be acceptable to them, never embarrassing to use |
| **Teachers** | first-class users; classroom operation is governed by OX |

Students experience **learning + achievement + collaboration**, **without feeling childish**. When these pull apart:
Growth > Achievement > Collaboration > Competition (CON).

---

## 2. Approved principles

| # | Principle | Meaning |
|---|---|---|
| P-1 | **Middle-school first** | designed for 13 to 15 year olds; elementary-school assumptions do not drive design (PKG G-1) |
| P-2 | **Acceptable to high-school students** | nothing a 17 year old would be embarrassed to use in front of classmates |
| P-3 | **Playful, not childish** | fun ≠ childish: challenge, discovery, wit and satisfying moments; no baby talk, constant celebration or rewards for everything (table below) |
| P-4 | **Concept understanding first** | the learning content is the centre of every screen; effects and rewards serve understanding, never replace it |
| P-5 | **Personal growth visibility** | students see their own progress, mastery and growth, never their classmates' (section 3.2) |
| P-6 | **Recognition without individual comparison** | recognition for reaching something, never for being ahead of someone; individual ranking prohibited (CON rules 4, 5; OX-5) |
| P-7 | **Collaboration visibility** | students feel that others are present, contributing and able to help, without personal metrics (table below) |
| P-8 | **Safe mistakes** | a wrong answer is part of learning: no penalty wording, no public exposure, a missed word comes back as a chance (recall badge, section 3.3) |
| P-9 | **Participation for students with different starting points** | every student can contribute something meaningful; recognition rewards personal progress, not absolute level |
| P-10 | **Readable learning content** | cells, clues, numbers and content are never made harder to read by any effect (CE-11) |

**Playful, not childish (P-3)**

| Playful (wanted) | Childish (avoided) |
|---|---|
| challenge that respects the student's ability | praise for trivial actions |
| satisfying moments when something is solved | constant celebration, noise, rewards for everything |
| wit and a light tone in wording | baby talk, exaggerated cheering, a mascot speaking for the content |
| progress that means something | stickers, stars and points as the main reason to play |
| a shared mission | fairy-tale framing that makes the content feel like a game for little children |

**Collaboration visibility (P-7)**

| Feeling | Expressed through |
|---|---|
| others are present | the team is shown as a team ("1팀 · 3명"), not as a list of names (P3-D1) |
| others are contributing | teammates' letters appear on the shared grid; a neutral "다른 팀원이 수정했어요" (E-3); team combo (3.1) |
| others can help | anonymous structured signals and Shared-Action Jigsaw actions (PKG H) |

Never shown to students: who wrote which cell, per-student counts, contribution figures, signal senders (H-7, H-11),
who caused a combo (3.1).

---

## 3. Design decisions

### 3.1 Combo

| Rule | |
|---|---|
| Team combo only | combos belong to the team |
| No individual combo | no student has a combo of their own |
| Based on consecutive team solves, not time | a streak of words the team solves in a row; no speed or timer element |
| Anonymous cooperation combo | may be used when intersecting words are connected (a solved word unlocks or completes a crossing word) |
| Never show who caused more combos | no attribution of a combo to a member, on any screen |

Combo wording remains **provisional** and requires prototype comparison (section 4). A combo is recognition, not a
score; it follows P-10 (never reduces readability).

### 3.2 Growth

- Growth gauges use **mastery-stage progression only**.
- Not used for growth: **clicks, login frequency, activity volume, raw collaborative solve count.**
- **Collaborative play records that a word was encountered.** It does not raise mastery by itself.
- **Personal recall raises mastery** (PKG G-5: recall, review, spaced repetition, personal mastery).

**Mastery model** (PKG I-5; [Growth Model and Mastery v1](growth-model-and-mastery-v1.md), approved):

| Stage | Reached by |
|---|---|
| Encountered | the word appeared in a puzzle the student played (individual or team) |
| Recall | the student recalled the word in personal play |
| Retained | the student recalled it again at least 7 days later |

**Deferred:** the explanation stage, full mastery labels, and the badges that depend on them. Growth never affects
scores, competition or combos. The Growth Model defines how each stage is detected and stored.

### 3.3 Badges

| Allowed (initial) | Deferred | Prohibited |
|---|---|---|
| successful recall of a previously missed word | first word reaching the explanation stage (I-5) | speed |
| personal recall without hints | helping a team through clue sharing, as a permanent personal badge (I-4) | rank |
| | | most solved |
| | | activity volume |
| | | any badge based on structured collaboration signals (I-4) |

Clue sharing may instead give a **one-time private impact feedback**, not stored (PKG H.4).

**Badges are private by default.** They are not shown to classmates or on projected screens (OX-12).

### 3.4 Characters and team identity

The earlier animal-material decision is **superseded** by prototype comparison (PKG I-8). Prototype at least:

1. a restrained animal symbol;
2. an abstract emblem or call sign;
3. a no-character icon system.

A **no-character option** is always included. The choice is made after student validation (section 4).

### 3.5 Student agency

**Limited student choice is approved.**

- Initial implementation prioritises: **expression style** and **clue viewing order**.
- Choices take **no more than ten seconds** before play (OX-1).
- **Teachers may restrict the choice range.**
- Future decisions: role choice, difficulty choice, public growth display.

### 3.6 World narrative

**World restoration is a supporting motivational layer.** Real peer collaboration remains primary (PKG G-7).
Course Room terminology is used, not class-wide terminology: the **Course Room shared world** or **shared progress**
(PKG G-8). Its tone follows P-1 to P-3.

### 3.7 References only

| Topic | Governed by |
|---|---|
| Teacher-operated classroom, launch, overrides, teacher mobility | OX-1 to OX-4, OX-7 to OX-10 |
| Teacher-controlled team competition and team comparison | OX-5; PKG G-4; OPS D |
| Projection of screens | OX-12 |
| Data used for growth, badges and combos | OX-13; `docs/pilot` |

---

## 4. Provisional until student validation

| Item | To validate with students |
|---|---|
| Visual expression overall (tone, imagery, motion) | middle-school first, acceptable to high school |
| Combo wording | prototype comparison |
| Character and team identity (3.4) | the three prototypes, including no-character |
| Expression style options (3.5) | that the choice takes ten seconds or less |
| Wording register (해요체 today) | whether it reads as childish or distant |

---

## 5. Review (2026-11-02)

### 5.1 Resolved by the PM decisions

| Earlier item | Resolution |
|---|---|
| DV-1 "comparison minimized" vs rule 5 | P-6: recognition without individual comparison; team comparison stays in OX-5 |
| DV-4 animal nicknames and emoji style of doc 06 | 3.4: animal material optional; three prototypes; no-character option |
| DV-5 undefined mastery | 3.2: growth is mastery-stage progression; stages defined in the Growth Model package |
| DV-6 world narrative tone | 3.6: supporting layer, Course Room terminology |
| Q-1, Q-5, Q-7, Q-9 | answered by P-6, 3.3, 3.6, 3.4 |
| DV-7 personal clue-sharing badge vs team-level signal data | **resolved** (PKG I-4): signals and clue-sharing game actions separated; the badge is deferred; Q-10 answered |
| DV-10 combo in competition | combos are recognition; no score (this rule stays, see 3.1) |
| Operational content inside this vision (old sections 7 and 9) | moved to references (3.7) |

### 5.2 Conflicts found

| # | Conflict | Against | Proposed resolution |
|---|---|---|---|
| DV-8 | **"Recall of a previously missed word"** needs a per-student, per-word record of misses; Recall and Retained need recall records; today wrong answers are deliberately not stored | docs/m2/13 §1.3; product/01 §3; OX-13; TPS OD-11 | Define the records in the Growth Model package with a data-governance amendment |
| DV-9 | **Growth across a term vs the pilot retention rule (deleted no later than 30 days after the pilot end date, `docs/pilot/12` §2)** | E-6; OX-9 (UX-8) | Separate retention rule for mastery records |
| DV-10 | **Combo in team competition mode:** if combos affect a competition result they become a score | D-3 (recognition only); OPS H-5 | Combos never feed a competition score |
| DV-11 | **"Call sign"** (3.4) for a student would be a nickname shown to classmates, against "no classmate names" and the not-preferred nickname model | PKG C-2, G-9; H-7 | Call signs for teams only, unless the PM decides otherwise |
| DV-12 | **"Encountered" words from collaborative play** are a new per-student record derived from team attempts | OX-13; `docs/pilot/12` | Include in the Growth Model data amendment |

### 5.3 Design risks

| # | Risk |
|---|---|
| R-1 | Over-correction: avoiding "childish" leads to a dry tool students do not enjoy |
| R-2 | Age span: one tone for 13 and 18 year olds may fit neither |
| R-3 | Reward drift: badges and combos grow into points and bring comparison back |
| R-4 | Empty collaboration: with no names and no metrics, the team can feel abstract |
| R-5 | Team competition pressure: a weaker student can be blamed in the room, even if the screen shows nothing |
| R-6 | Thin growth data: with intermittent use, mastery may move slowly and discourage |
| R-7 | Combo pressure: a streak can push students to rush or to keep a weaker teammate from typing |
| R-8 | Private badges noticed anyway on shared or projected screens |
| R-9 | Playful motion vs readability and accessibility (P-10, reduce motion) |

### 5.4 Questions for the PM

| # | Question |
|---|---|
| Q-2 | What may express "others are present": a joined-member count only, or more? |
| Q-3 | One tone for middle and high school, or a variant for high school? (student validation) |
| Q-6 | May the teacher name teams and Course Rooms, or are labels generated ("1팀")? |
| Q-8 | Is 해요체 the standard register for student wording? (student validation) |
| Q-11 | What is "expression style" (3.5): the team emblem style, the student's own icon, or the theme of the student's screen? |

---

## Changes

| Version | Date | Change |
|---|---|---|
| v1 draft | 2026-11-02 | First draft, sections 1 to 10, review |
| v1 rev. 2 | 2026-11-02 | Final reconciliation: initial mastery model (I-5); badges revised, clue-sharing badge deferred (I-4); character supersession (I-8) |
| v1 | 2026-11-02 | **Conditionally approved.** Approved principles P-1 to P-10; combo, growth, badge, character, student agency and world narrative decisions; operational content moved to OX; provisional items listed; review updated |
