# Product vision: the student learning profile

Status: **vision note. Documentation only. Nothing here is scheduled, designed in detail, or implemented, and it changes no scope of M2-2.4.** Written 2026-10-17 for the PM, before M2-2.4 implementation starts. It describes where individual student data is meant to lead, so that M2-2.4 and M2-3 do not close doors, and so that the principle below is on record.

Relation to other documents: [M2-2.4 student play plan](../m2/07-m2-2-4-student-play-plan.md) (the first source of learning data) · [M2-3 competition framework](../m2/06-m2-3-competition-framework.md) (§11 CC-1…CC-10, §12 CE-1…CE-12) · [04 crossword generator](../m2/04-crossword-generator.md) · `docs/pilot/12-d6-data-governance-policy.md` and `13-d6-signoff.md` (the data governance this vision must pass through).

## Principle

```
Students see their own growth before they see any ranking.
Teachers see learning analytics.
Other students see nicknames only.
```

Three audiences, three views, one direction of trust. This extends the PM order of doc 06 §11.1, `Collaboration -> Engagement -> Competition`, to data: the first thing a student learns from the platform is **how they are growing**, not where they stand against classmates.

---

## 1. Student Learning Profile

**What it is.** A single place, visible to the student and (as analytics) to their teachers, that answers: *what have I practised, how am I doing, what is getting better, and what should I try next.* It is built from what the student does on the platform, not from free text the student or anyone else writes about them.

**What it is not.** A grade, a report card, a permanent record, a ranking, or a prediction about the student. It never feeds grades, discipline or placement. It does not exist outside the school's platform and is not shared with other students.

**Parts**

| Part | Content | Section |
|---|---|---|
| Learning history | what the student has played and finished, over time | 2 |
| Strengths and areas to practise | topics and skills, with plain-language wording | 3 |
| Achievements | recognition of effort, progress and cooperation | 4 |
| Growth | change over time against the student's own earlier results | 5 |

**Design stance**

- **Growth framing.** Everything is expressed as change from the student's own earlier performance. "You solved this 4 minutes faster than last time" before "you scored 82".
- **Non-punitive.** No red scores, no "weakest" labels shown to the student; weaknesses are shown as **"to practise next"**.
- **Honest about limits.** A crossword shows vocabulary recall in one format. The profile says what it measures, and never claims to describe the student as a person (see §6.4).
- **Opt-in depth.** The default view is small and positive; more detail is available on request.

---

## 2. Personal Learning History

**What it records.** For each puzzle the student has attempted: which puzzle and unit, when, whether it was completed, how long they actively worked, how many checks, reveals and 초성 hints they used. These are exactly the fields M2-2.4 already stores on the attempt (`status`, `completed_at`, `active_seconds`, `checks_used`, `reveals_used`, `chosung_used`, `submits_used`), so **the history needs no new collection to begin**; it is a read model over attempts.

**How a student sees it.** A timeline of their own puzzles ("지난주 · 광합성 퍼즐 · 완료 · 12분 · 힌트 2개") and per-puzzle result pages (the M2-2.4 result screen is the first entry of this history). No other student appears in it.

**Rules**

- History is **the student's own**; the student sees every item recorded about them in the profile (no hidden scores).
- Derived values (averages, trends) are computed on read or in a clearly versioned rule, never stored inside the attempt (consistent with doc 06 §7.4: no rank or score in the attempt).
- History follows the retention and erasure rules of the governance policy: it disappears with the student's data (§6.5).
- Attempts are per assignment. A superseded puzzle version keeps its attempt as history but does not carry progress forward (M2-2.4 plan A.6).

**Boundaries now.** M2-2.4 builds the attempt and its result screen. A history list and any cross-puzzle view are **not** part of M2-2.4 and need their own design and the governance steps of §6.

---

## 3. Strengths and Weaknesses

**Goal.** Help a student see *what they are good at and what to practise*, and help a teacher see *where the class and individuals need support*, without labelling anyone.

**Possible signals (all derived from server-verified play, never from keystroke logging)**

| Signal | Source | Caveat |
|---|---|---|
| Words solved without hints, per topic or content set | completed attempts and per-word outcomes | needs per-word results, which M2-2.4 does **not** store (only counters); a later phase would have to add them deliberately |
| Words that needed a reveal or 초성 | reveal and hint events | only the minimal events the PM accepted (E.6), kinds and counts, no letters; per-word attribution is a future decision |
| Kinds of vocabulary (Hangul, Latin, digits, long words) | puzzle structure | weak signal |
| Hint use trend | counters | a student who uses hints is not "weak"; hints are a normal learning tool |

**Presentation rules**

- **Strength first, then "to practise".** The student's view lists what is going well and offers one or two suggestions ("이 낱말들을 다시 풀어 보세요").
- **No numeric labels for weakness shown to the student**; no comparison to class average in the student's view (that would be a ranking in disguise, see §7).
- **Teacher view** may show topic-level difficulty for the class and for an individual (§6.2), as support information, with the explanation that a crossword measures vocabulary recall only.
- **Never decided by the system alone:** the profile suggests, a teacher or the student decides. It is not an assessment record, and it is never used for grading, ranking or discipline (the same written ban doc 06 §12.5 G3 proposes for contribution data).

**Honest limits to state in the product.** Few attempts give weak evidence; a puzzle's words depend on the teacher's set; hints depend on the preset. The profile shows confidence ("아직 기록이 적어요") rather than a verdict when data is thin.

---

## 4. Achievement System

**Purpose.** Recognise effort, progress and cooperation, so that students with different levels all have something meaningful to earn. This is the Badge system of doc 06 (CC-10, M2-3.1), described here from the student-profile side.

**Principles (from the PM direction in doc 06)**

- **Cosmetic by default.** Achievements recognise; they do not unlock anything unless the PM later decides otherwise (open question K13/K18).
- **Effort and growth over absolute result.** Examples: "first puzzle completed", "finished without revealing a letter", "improved your time", "came back to a puzzle after a break", "five puzzles in a month". Not "top scorer".
- **Reachable by everyone.** Every student can earn some achievements with ordinary effort; none depend on beating a classmate.
- **Private by default.** A student sees their own achievements. Showing achievements to others (nicknames only) is a separate decision.
- **Never retroactively punishing.** Achievements are not lost; rules are versioned (doc 06 scoring-version pattern).
- **No pressure mechanics.** No streak-loss penalties, no countdown "you will lose", no public absence of achievements.

**Data.** Awards derive from attempts plus a versioned rule; an `earned` record holds ids and dates, no names. It cascades from `students` like all student data (§6.5).

**Boundary.** Badges are M2-3.1 and need the governance step for new data (doc 06 §11.4 note 7); M2-2.4 adds none.

---

## 5. Growth Tracking

**What "growth" means here.** Movement of a student against **their own earlier results**: more words solved with fewer hints, less time on comparable puzzles, longer return to the platform, more difficult puzzles attempted.

**Measures (all relative to the same student)**

| Measure | Definition | Fairness rule |
|---|---|---|
| Independence | share of cells entered without reveal or 초성 | compare only within a difficulty preset (presets change hints, doc 04 §3.1) |
| Speed | `active_seconds` per solved word | only comparable on similar puzzle size; shown as a trend, never as a rank |
| Persistence | puzzles started and finished over time | counts finishing, not speed |
| Reach | difficulty level attempted | easy → normal → hard is progress, not failure |

**Presentation.** "Last 4 puzzles" trends with plain words ("조금씩 빨라지고 있어요"), short and encouraging; a baseline is the student's first attempts, not the class. Small sample sizes display as "더 풀어 보면 알 수 있어요".

**Teacher analytics.** Class and individual trends, puzzles that most students found hard (aggregate), students who have stopped playing, hint use. This is the **learning analytics** of the principle. It supports formative teaching (doc 06 CE-2: "teacher visibility takes priority over leaderboard visibility"); it is informational, with the same statement that verbal collaboration and effort off the platform are not measured (CE-8).

**Not growth tracking.** Behaviour monitoring (focus tracking, time stuck, presence). Those belong to doc 06 CE-1/CE-3 and are blocked on governance questions G1 and G2.

---

## 6. Privacy Model

### 6.1 Who sees what

| Audience | Sees | Never sees |
|---|---|---|
| **The student** | their own profile: history, strengths and practice suggestions, achievements, growth; team and class progress aggregates when M2-3 exists | other students' results, names, student numbers or achievements; a rank before their own growth view is available |
| **Teachers** (classroom owner, co-teachers, admin of that classroom's school) | learning analytics for their own classrooms: individual and class history, topic difficulty, hint use, achievements, participation; real name and student number | other classrooms' students (doc 04 §5.5), anything outside the school |
| **Other students** | **nicknames only**, and only where a feature shows other students at all (team board, nickname leaderboards, collaborative play; doc 06 CC-6) | real names, student numbers, personal histories, strengths/weaknesses, hint use |
| Guardians / outside the school | nothing through the platform in this vision; any guardian view is a separate decision for the school | n/a |

### 6.2 Rules

1. **Own growth first.** The first student-visible comparison feature, if any, is a student's comparison with their **own past**. Any view that places a student relative to others comes later, is aggregate or nickname-based, and follows the competition gates (§7).
2. **Nicknames are generated, never typed** (doc 06 §11.7 #1): assembled from fixed word lists, unique inside a classroom, resettable by the teacher; still personal data (pseudonymisation), covered by the governance policy.
3. **No free text about students.** The profile contains no teacher comments, student self-descriptions or labels typed by anyone, consistent with `docs/pilot/12` §1 (no free-text profiles). Suggestions come from fixed wording.
4. **Not a record.** The profile is never an input to grades, ranking, placement, discipline or admission, written as a rule (doc 06 §12.5 G3). It states what it cannot measure.
5. **Erasure and retention.** Every profile-related table references `students` with cascade, so the existing end-of-pilot and erasure procedure keeps working. Derived data is recomputable and holds no names. The 30-day post-pilot retention applies as it does to attempts. What happens to *shared* data when one member is erased is open (G4).
6. **Data minimisation.** Collect only what play already verifies on the server (counters, completion, timing). No keystrokes, no cursor or selection tracking, no content of what was typed beyond the attempt state itself.
7. **Transparency.** A student can see everything the profile shows about them, in plain Korean, and what each number means. Teachers see the same facts plus aggregates; there is no hidden score.
8. **Access in code, not only in policy.** Students have no direct table access (RLS has no student policy on crossword and attempt tables); every student view is built by server code from an allow-list, as in the M2-2.4 plan C.8. Profile views are new allow-lists, not new student table policies.
9. **Governance first.** None of this goes live before `docs/pilot/12` and `13` are updated for each new data category and purpose, with the data-protection contact's agreement and the D6 signature (the same gate doc 06 §6 and §11.5 set for competition). Whether guardian notice is needed is a question for the school contact, not assumed.

### 6.3 New data categories this vision would add (all future, none created now)

Per-word outcomes (if wanted), derived growth figures, earned achievements, nickname, and any history views. Each needs its own governance entry before it is built.

### 6.4 What the profile must never claim

It does not measure intelligence, ability or potential. It reports activity on one kind of vocabulary exercise. Wording is checked so that it never states or implies that a student "is" weak or strong.

---

## 7. Relationship to the Competition Framework

The profile and doc 06 share one direction: **cooperation, then engagement, then competition**.

| Topic | Relationship |
|---|---|
| Order | The profile's own-growth view comes **before** any ranking. In the doc 06 order (CC-10), badges (M2-3.1) and class goals (M2-3.2) already precede team boards and nickname leaderboards (M2-3.5); the profile's history and growth views fit at or before M2-3.1 and need no student-to-student comparison |
| Badges | The Achievement System (§4) is the student-profile face of the badge system (CC-10, M2-3.1) |
| Team and class views | Team progress boards and class goals (CC-5, CC-9, CE-9, CE-10) show **aggregates and progress toward a goal**, never a student's weaknesses; a student's personal profile is not shown on a team board |
| Leaderboards | If ever built, **nickname-based**, late (M2-3.5), opt-out per student, teacher can disable, computed from closed results, never showing "last place" (doc 06 §4). A student's rank is never shown before their own growth view exists, and a leaderboard never uses strengths/weaknesses data |
| Teacher awareness | The teacher analytics here and the awareness dashboard of CE-2 overlap and should be one product surface, built after the governance answers G1 to G3 |
| Contribution tracking | Individual learning profile data and team contribution figures (CE-8) are different data with different disclaimers; the profile never shows a student their share of a team's work |
| Shared attempts | A shared attempt (CE-4, CE-6) needs per-student attribution to feed an individual profile; M2-2.4 keeps `cells` free of identity and the actor separate, so attribution can be added later without rewriting history (M2-2.4 plan F). Until attribution exists, shared-attempt play adds **team-level** history only, not per-student strengths |
| Safety | CE-11 applies: nothing here reduces learning visibility, and nothing creates pressure ("learning promotes growth, mistakes are not punished", CC-7) |

**Where the principle becomes a gate.** Doc 06 §6 requires the written narrowing of decision C6 (today: no rankings or leaderboards) before anything student-visible beyond a student's own progress. The learning profile is a student-visible own-progress feature, so it is the **first** thing C6 permits and the natural precedent for the rest: own growth shown first, aggregates next, nickname comparisons last.

---

## 8. What M2-2.4 must keep possible (no scope change)

The M2-2.4 plan already holds these; this note only records why they matter for the profile.

- Counters and timing stay on the attempt, with `completed_at`, so growth can be computed later without migration (plan B.2).
- No derived rank or score is stored in the attempt.
- The attempt is keyed by attempt and puzzle with members in a separate table, so a student's history is "attempts where I am a member", valid for individual and, later, team attempts.
- The minimal events table (kinds and counts only, E.6) is the only hint-level history; **per-word outcomes are deliberately not stored in M2-2.4**. If per-word strengths and weaknesses are wanted, that is a new decision with its own governance entry, not an accident of play code.
- The result screen shows the student's own cells and counters, never a comparison, so it can become the first page of the history.
- Student views are allow-listed server payloads; the profile adds views, not table policies.

## 9. Open questions for the PM

| # | Question |
|---|---|
| P1 | Is a student-visible learning profile wanted at all in the pilot school, and is it first or after badges and class goals? |
| P2 | Per-word outcomes: should play record which words a student solved with or without hints, to enable strengths and weaknesses? (It would be new student data, not in M2-2.4.) |
| P3 | Who may see an individual student's analytics: the classroom owner and co-teachers, or the whole school's teachers? (Doc 04 §5.5 currently limits to the classroom's teachers.) |
| P4 | May students see a comparison with the class average, or is it strictly own past only? (Recommendation here: own past only.) |
| P5 | Do achievements unlock anything, or stay cosmetic (links to K13/K18)? |
| P6 | Do guardians get any view, and is guardian notice required (a question for the school's data-protection contact)? |
| P7 | How long is a student's history kept inside a school year and across years? (Pilot rule: 30 days after the pilot; a real deployment needs its own.) |
| P8 | Wording review: who approves the Korean text of strengths, practice suggestions and the "what this does not measure" statement? |
| P9 | Should the teacher analytics and the CE-2 awareness dashboard be a single surface, and in what order relative to M2-3.1? |

None of these block M2-2.4.
