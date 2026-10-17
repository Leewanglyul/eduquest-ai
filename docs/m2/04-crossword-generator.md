# M2-2. Crossword generator (design)

Status: **M2-2.1 (the generator core) is implemented in `src/features/crossword/generator/` with its tests; the rest of M2-2 is design only (no migration, no screen).** PM decisions applied: **C1 one-character words are allowed** and **C7 scripts are Hangul, Latin letters and digits; emoji and symbols are rejected**. Builds on M2-1 (word sets: schema, import, management, export) as implemented on `m2/m2-1-content-pipeline`. Owner: engineering. Needs: PM answers to the other items of §10 before M2-2.2 starts, and the update of `docs/pilot/12` (§6.7) before any real student plays.

Scope: from the live entries of one **content set**, generate a **crossword puzzle**; a teacher reviews and publishes it to a classroom; students play it. Out of scope: AI-generated clues or words, other game types, printing to PDF, rankings across schools, self-registration, anything outside the single-school pilot.

Parts: §1 Grid strategy · §2 Placement algorithm · §3 Difficulty rules · §4 Teacher review workflow · §5 Student play workflow · §6 Database impact · §7 Delivery phases · §8 Test plan · §9 Risks · §10 Open decisions for the PM.

The screen the PM sketched for play has four areas, which this design keeps: **Crossword Grid · Across · Down · Hints** (§5.2).

---

## 0. What M2-1 already guarantees (the generator's input contract)

From `content_entries` through `v_content_entries_active` (live entries of a live set), per entry:

| Field | Guarantee |
|---|---|
| `answer` | NFC text matching `^[가-힣A-Z0-9]+$`, unique per set, 1–15 characters (D2 allows 1) |
| `answer_length` | number of code points = number of grid cells (one Hangul syllable = one cell, one Latin letter or digit = one cell; assumption A4 of the M2-1 design) |
| `script` | `hangul`, `latin`, `digit` or `mixed` |
| `term`, `definition` | clean plain text, 1–60 and 1–200 characters; `definition` is the clue |
| `id` | stable UUID, kept for provenance only |

Inherited rules that shape M2-2:

1. **Copy, do not point** (M2-1 design §7). A puzzle stores its own copy of every answer and clue. Editing, replacing or archiving the set never changes a puzzle that students are solving.
2. **Answers never reach a student's browser before play** (decision D11 left open; this design closes it, §5.3).
3. **Per-student results are student data** (`docs/pilot/12`): they must cascade from `students` so the existing erasure procedure keeps working (§6.7).
4. **Archive only, no purge** (D5). **Ownership must be transferred before a teacher can be deleted** (P1). **Archived classroom = read-only** (P2). **Owner, classroom owner, co-teachers and admin manage content alike** (D3).
5. One-character entries exist (D2) and, by decision **C1**, **are used**. A run of one cell is not a crossword word, so a one-character word is a **one-cell word**: it has no cells of its own but sits on a cell of another word, in the direction that word does not use, and adds a numbered clue `(1)` for that cell. It never adds a run of two or more cells, so none of the properties of §1.1 is affected. It needs a cell with the same character that only one word uses; otherwise it is listed as "could not be placed" (`NO_MATCHING_CELL`).

---

## 1. Grid generation strategy

### 1.1 Kind of puzzle

A **free-form (sparse) crossword**: only the teacher's words are placed, they cross each other, and every other cell is empty (shown as a dark cell). It is not a dense, symmetric newspaper grid; filling such a grid needs a large dictionary that we do not have, and a class vocabulary list of 8–25 words would never fill one.

Properties every generated puzzle must have (checked by a validator, §2.6):

| # | Property |
|---|---|
| P1 | Every word has at least 2 cells and lies fully inside the grid |
| P2 | The puzzle is **connected**: every word crosses at least one other word |
| P3 | Where two words share a cell they have the **same character** |
| P4 | There are **no unintended words**: reading every maximal horizontal and vertical run of 2+ filled cells gives exactly the placed words, nothing more |
| P5 | Words in the same direction never touch end to end or side by side |
| P6 | No answer is placed twice (answers are unique in a set) |
| P7 | The bounding box fits the chosen grid size (§3, at most 15 × 15) |
| P8 | Output is **deterministic** for the same inputs, seed and generator version |

### 1.2 Cells and characters

- One cell holds one character of `answer`: a Hangul syllable block, a Latin capital letter or a digit. Two cells are "equal" when the characters are identical code points (NFC, so a Mac-typed decomposed syllable never mismatches).
- **Script rules (decision C7).** An answer may consist of Hangul syllables, Latin capital letters and digits, and any mixture of them (`3D프린터`, `COVID19`). Anything else, in particular **emoji, symbols, spaces, hyphens, jamo, lowercase-only forms of other alphabets**, is rejected by the generator itself (`INVALID_CHARACTERS`) even though the word sets already refuse it: the generator does not trust its input. A teacher may switch a script off for one puzzle (a script option; an entry is used only if every script in it is on). Crossings are by character equality, so a Hangul syllable can only cross a Hangul syllable, a Latin letter only the same letter, and a digit only the same digit; a mixed answer such as `3D프린터` is what lets the scripts meet.
- **Jamo-level play** (one consonant or vowel per cell, as in some Korean word games) is not supported: the data would allow it (decompose `answer` with NFD), but the grid, the keyboard and the clues would all change. Left for a later design.

### 1.3 Choosing the words

1. Start from the live entries of the chosen set (the set must be live; its classroom may not matter for drafting).
2. **Eligibility filter**, each rejected entry gets a reason shown to the teacher: empty answer · characters that cannot be cells (emoji, symbols, spaces) · script switched off · length below `CROSSWORD_MIN_WORD_LEN` (**1**, decision C1) or above `min(gridSize, maxWordLen)` · duplicate answer · excluded by the teacher.
3. **Selection** when more entries are eligible than the puzzle should hold (`wordCount`, §3): teacher-pinned words always; then words ranked by a **connectivity score** (how many characters the word shares with the other eligible words, weighted so that every word has at least one possible partner), then random with the seed. A word with no possible partner (it shares no character with any other eligible word) is reported as "cannot be connected" and never forces a failure.
4. The same set can produce many puzzles (different seeds, options, subsets).

### 1.4 Size

| Grid size | Use |
|---|---|
| 10 × 10 | easy, up to about 10 words |
| 13 × 13 | normal |
| 15 × 15 | hard; equal to the longest allowed answer (`ANSWER_MAX_LEN` = 15) |

The generator works on a working area of 2 × size and then **trims** to the bounding box; a puzzle whose box exceeds the chosen size is rejected, not cropped.

---

## 2. Placement algorithm

### 2.1 Overview

A **seeded randomized greedy search with restarts**, the usual method for free-form crosswords. It is simple, fast for 5–25 words, easy to test, and keeps the best result found within a time and iteration budget. An exact method (constraint solving, SAT) was considered and rejected: the result is better only in cases where the teacher can simply regenerate, and the cost in code and risk is much higher.

```
generate(entries, options, seed):
  rng = mulberry32(seed)                      # integer-only PRNG, same result on every machine
  words = select(entries, options)           # §1.3, ordered by length desc, ties by connectivity then rng
  best = none
  for attempt in 1..MAX_ATTEMPTS (until TIME_BUDGET_MS):
      grid = empty
      place words[0] in the middle, horizontal
      pending = words[1..]
      repeat until no pending word can be placed:
          for word in pending (in order, with a small random shuffle of equal scores):
              candidates = crossingPositions(grid, word)          # §2.2
              valid = [c for c in candidates if isLegal(grid, word, c)]   # §2.3
              if valid: place the highest scoring (top-k picked with rng)  # §2.4
              else keep word in pending
      puzzle = trim(grid); if validate(puzzle) and betterThan(puzzle, best): best = puzzle
  return best (or "no puzzle: fewer than MIN_WORDS words could be connected")
```

### 2.2 Candidate positions

For a word `W` (characters `w[0..n-1]`) and every already placed word `P` (characters `p[0..m-1]`, start `(r, c)`, direction `d`):

- For each pair `(i, j)` with `w[i] == p[j]`, place `W` in the **perpendicular** direction so that `W[i]` lies on `P[j]`.
- Across `P` at `(r, c)`: `P[j]` is at `(r, c + j)`; a down `W` starts at `(r − i, c + j)`.
- Down `P` at `(r, c)`: `P[j]` is at `(r + j, c)`; an across `W` starts at `(r + j, c − i)` … (mirror image).

No candidate exists for a word that shares no character with any placed word; it stays pending and may become placeable later.

### 2.3 Legality of a candidate

Let `cells(W)` be the cells the word would occupy. The candidate is legal only if **all** of the following hold; each rule maps to a property of §1.1:

1. **Bounds** (P1, P7): every cell is inside the working area and the resulting bounding box is within the chosen size.
2. **Letters** (P3): for each cell already filled, the character is equal; otherwise it is empty.
3. **Not an overlap along the same line** (P5): at least one cell is new, and no cell is shared with a word of the *same* direction (collinear words may not overlap or touch).
4. **Ends are clear** (P4, P5): the cell before the first letter and the cell after the last letter (along the word's direction) are empty or outside the grid.
5. **Sides are clear** (P4): for every **new** cell (not a crossing), both perpendicular neighbours are empty. Without this rule two parallel words side by side would silently create two-letter words.
6. **A real crossing** (P2): at least one cell of `W` is an existing cell of a perpendicular word, and at each such cell the two words really cross (neither extends the other).

### 2.4 Scoring a placement and a puzzle

Placement score (used to choose among legal candidates, higher is better):

```
score = 3 * crossings                      # cells shared with existing words; more crossings = more connected, easier
      + 1 * min(across, down balance)      # keep both directions represented
      - 2 * growthOfBoundingBoxArea        # prefer compact puzzles
      - 1 * distanceFromCentre
      + rng jitter (0..1)                  # so restarts differ
```

Puzzle score (used to keep the best of the restarts), compared in this order: **more words placed → more crossings → smaller bounding-box area → aspect ratio closer to 1 → lower seed** (so equal puzzles are stable).

### 2.5 Numbering and clues

After trimming, walk the grid row by row, left to right. A cell gets a **number** if it starts an across word (no filled cell to its left, a filled cell to its right) or a down word (no filled cell above, a filled cell below). The number is shared by the across and the down word that start there. Clues are listed under **Across** (가로) and **Down** (세로) in number order. Each clue shows the number, the definition and the length in parentheses, for example `1. 빨간색이나 초록색의 둥근 과일 (2)`.

### 2.6 Validator (also run on every save and publish)

Independent of the placer, `validatePuzzle(puzzle)` rebuilds the grid from the stored words and checks P1–P7: it re-extracts all maximal runs of 2+ cells in both directions and requires them to be exactly the stored words with their numbers. The same check exists in SQL for publishing (§6.5). A puzzle that fails either check is never saved or shown to students.

### 2.7 Worked example

Words 사과, 과일, 일기, 기차 give this 3 × 3 puzzle (`■` = empty cell):

| | col 0 | col 1 | col 2 |
|---|---|---|---|
| row 0 | **1** 사 | **2** 과 | ■ |
| row 1 | ■ | **3** 일 | **4** 기 |
| row 2 | ■ | ■ | 차 |

Across: 1 사과, 3 일기. Down: 2 과일, 4 기차. Cell (1,1) `일` is the end of down 과일 and the start of across 일기; (1,2) `기` is the end of across 일기 and the start of down 기차. No other run of two or more cells exists, so P4 holds.

### 2.8 Performance, determinism, limits

- 25 words: each attempt tries about `25 × (letters × placed words)` candidates, a few thousand checks; 200 attempts fit well under **500 ms** in Node. The budget is a constant (`CROSSWORD_TIME_BUDGET_MS`, 800) so the work stays far inside a hosting request limit; if it is reached, the best puzzle so far is returned.
- Determinism: integer-only PRNG (`mulberry32`), stable sorting, no `Math.random`, no floating point in comparisons. A puzzle is identified by `(set entries hash, options, seed, generatorVersion)`; the same inputs always give the same puzzle, which is what makes preview-then-save safe (§4.3).
- Caps (one constants file, also passed to the UI as props, as in M2-1): `CROSSWORD_MIN_WORDS` 5, `CROSSWORD_MAX_WORDS` 25, `CROSSWORD_MIN_WORD_LEN` 2, `CROSSWORD_MAX_GRID` 15, `CROSSWORD_TIME_BUDGET_MS` 800, `CROSSWORD_MAX_ATTEMPTS` 300, `GENERATOR_VERSION` 1.

---

## 3. Difficulty rules

Difficulty is a **preset of option values** plus a **computed descriptive score**. The generator never claims a puzzle is "hard" on its own; it reports numbers, and the teacher decides.

### 3.1 Presets (all values are constants, proposals for the PM, §10)

| Option | 쉬움 (easy) | 보통 (normal) | 어려움 (hard) |
|---|---|---|---|
| Grid size | 10 | 13 | 15 |
| Words | 6–10 | 10–16 | 14–25 |
| Word length | 1–5 | 1–8 | 1–15 |
| Minimum crossings per word (average) | 1.6 | 1.3 | 1.0 |
| Cells pre-filled for the student | about 25 % of cells (never a whole word) | about 10 % | none |
| Letter reveals per student | 3 | 1 | 0 |
| Check feedback | any time, per cell | per word, on request | only on submit |
| 초성 hint (first consonants, §3.3) | allowed | allowed | not available |
| Scripts | 한글, 영문, 숫자 | 한글, 영문, 숫자 | 한글, 영문, 숫자 |

A teacher can start from a preset and change any option before generating. Changes are saved with the puzzle (`settings`), so the screen can say "쉬움 (조정됨)".

### 3.2 Computed descriptive score (shown to the teacher, not to students)

```
difficulty = clamp( 0..100,
    3.0 * averageWordLength
  + 1.0 * wordCount
  - 6.0 * averageCrossingsPerWord          # more crossings give the student more known letters
  - 0.5 * prefilledPercent
  - 4.0 * revealsPerStudent
  + 10  * (checkMode == "submitOnly") )
```

The weights are a starting point; they only have to order puzzles sensibly and are covered by tests on fixed examples. The review screen shows the score next to the number of words, crossings, fill ratio and the shortest and longest answer.

### 3.3 Hints that do not leak the answer

- **Clue** = the entry's `definition` (the teacher's text). Not shown: the term.
- **Clue masking** (option, default on): if the clue contains the answer text (the `DEFINITION_CONTAINS_ANSWER` warning of the importer, answers of 2+ characters), the occurrence is replaced by `○` repeated for each cell in the puzzle's own copy. The set is not changed. The review screen lists every masked clue so the teacher can reword it.
- **초성 hint**: for a Hangul answer, the initial consonants (`사과` → `ㅅㄱ`), computed with Unicode arithmetic on the syllable (`(code − 0xAC00) / 588`). It reveals only the consonants, and is produced by the server on request. For Latin answers the hint is the first letter. Digits and mixed answers: no 초성 hint.
- **Letter reveal**: the server returns one letter of the answer on request and records it (`reveals_used`).
- **Length** `(n)` is always shown in the clue.

### 3.4 Quality rules at generation

Reject or warn (shown on the review screen):

- fewer than `CROSSWORD_MIN_WORDS` words placed → no puzzle, with the list of words that could not be connected and the reason;
- a word with only one crossing in an otherwise dense puzzle → warning "weakly connected";
- duplicate clue texts → warning;
- no linguistic analysis is done (similar words, hints that give the answer away in other forms): the teacher reviews the clues.

---

## 4. Teacher review workflow

### 4.1 States

```
draft ──publish──► published
  │                    │
  └────archive────► archived ◄────archive────┘      (archived can be restored to its previous state)
```

- **draft**: editable (title, clue wording, options) and regenerable; invisible to students.
- **published**: the grid, words and clues are **frozen** because students hold progress against them. To change anything the teacher makes a **new version** (copy) and archives the old one. A published puzzle can be **closed** to a classroom (assignment closed) without deleting attempts.
- **archived**: hidden, read-only, restorable (archive only, D5).

There is no "unpublish back to draft": it would let a draft change under students' feet. Close the assignment and copy instead.

### 4.2 Screens (teacher area, under `/teacher/crosswords`)

| Screen | Content |
|---|---|
| Puzzle list | own and classroom puzzles, status, set, level, words, assigned classrooms, completion counts; filters 초안 / 배포됨 / 보관됨 |
| New puzzle (`/teacher/crosswords/new?setId=`) | pick the set; preset; options; word list with checkboxes (include / exclude / pin) and, for each excluded entry, the reason (too short, too long, other script); **생성** button |
| Review | the grid **with the solution visible to the teacher**, Across and Down clue lists, warnings (masked clues, weak connections, words not placed), statistics (words, crossings, fill ratio, size, difficulty score), and the buttons **다시 생성** (new seed), **저장**, **학생 화면으로 미리보기** |
| Student-view preview | the real play screen (§5) with a temporary attempt that is never stored; no answers in the payload, same code path as students |
| Publish | choose one or more classrooms the teacher may manage (owner or co-teacher; not archived), optional opening and closing times; **배포** |
| Results (`/teacher/crosswords/[id]/results`) | per classroom: students, status (not started, in progress, completed), time, checks and reveals used; no ranking by default |

### 4.3 Preview then save: the same ticket idea as the CSV import

1. **Generate** (server action) returns the puzzle plus a **preview ticket**: `batchId` and a single-use token whose hash is stored, with a hash over `(entries hash, options, seed, generatorVersion, canonical placement)`.
2. **Save** posts the options, seed and ticket. The server **regenerates** from the set's current live entries and the same seed, recomputes the placement hash and compares it with the stored one. Equal → the draft is stored. Different (the set changed in between, or the generator version changed) → "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요." Nothing is trusted from the browser except the seed and the options.
3. Review edits that are allowed on a draft: title; the **clue text of a word** (only the puzzle's copy); removing a word and regenerating without it. Not allowed: moving words by hand (a hand-edited grid could break P4; if wanted later it needs the validator on every edit).

### 4.4 Who may do what

Same rule as word sets (D3): the set owner, the classroom owner, co-teachers of the classroom and admins manage the puzzle. A puzzle is owned by its creator (`owner_id`, ownership transfer required before deleting the teacher, P1). Publishing to an **archived classroom is refused**; an assignment in a classroom that is later archived is read-only and students of an archived classroom cannot play (they cannot see it, `classrooms_select_enrolled_student`). Students and outsiders have no access.

### 4.5 Audit (teacher actions only)

New `audit_resource`: `crossword`. New `audit_action`s: `crossword.created`, `crossword.updated` (title or a clue; `fields` only, no text), `crossword.published` (`{ classroomIds, level, wordCount }`), `crossword.assignment_closed`, `crossword.archived`, `crossword.unarchived`. No terms, answers or clues in any `metadata`. Student progress is data, not audit.

---

## 5. Student play workflow

### 5.1 Reaching a puzzle

`/student` shows, for each classroom the student is **actively enrolled in** (not archived), the puzzles with an active assignment inside its opening and closing times. The page uses the existing student guard (`requireStudentAreaPage`: student role, forced password change done). The student sees title, number of words, the state (새 퍼즐, 이어하기, 완료) and the closing time.

### 5.2 Play screen: Grid · Across · Down · Hints

```
┌──────────────────────────────────────────────┬───────────────────────────┐
│ CROSSWORD GRID                               │ ACROSS 가로                │
│   cells with numbers; the selected word is   │  1. clue text (2)          │
│   highlighted; dark cells are empty cells    │  3. clue text (2)          │
│                                              │ DOWN 세로                  │
│                                              │  2. clue text (2)          │
│                                              │  4. clue text (2)          │
├──────────────────────────────────────────────┴───────────────────────────┤
│ HINTS 힌트:  [초성 보기] [글자 하나 알려주기 (남은 횟수 n)] [확인]  진행 6/12 │
└──────────────────────────────────────────────────────────────────────────┘
```

Behaviour:

- Select a cell: the word through it is highlighted and its clue is marked. Selecting a crossing cell again switches between across and down. Arrow keys move, Tab and Shift+Tab go to the next and previous clue, Backspace clears and moves back.
- **One cell, one syllable.** Korean input uses an IME that builds a syllable from several keystrokes. The cell input must keep the composition (`compositionstart`, `compositionend`) and accept the cell's character only when the syllable is complete, then move to the next cell. This is tested on the school's real devices and browsers (§9).
- The Hints bar offers only what the puzzle's settings allow (§3.1): 초성 for the selected word, reveal one letter (counted, limited), and **확인** (check). Hint results are shown in the Hints area and next to the clue.
- Mobile: the same layout, clues below the grid, on-screen keyboard; the grid scrolls, never overflows the page.
- Accessibility: every cell has an accessible name ("가로 1번, 2글자, 첫 번째 칸"); clue lists are real lists; contrast and focus rings meet WCAG AA; nothing depends on colour alone (correct/incorrect also use icons and text); no time limit by default.

### 5.3 What the browser receives, and what it never receives

Play payload (everything the student's browser gets for a puzzle):

```
{ puzzleId, title, rows, cols,
  words: [{ number, direction, row, col, length, clue }],          # NO answer
  prefilled: [{ row, col, char }],                                   # only the cells the preset reveals
  settings: { checkMode, revealsAllowed, chosungAllowed },
  attempt: { cells: { "r,c": "사" }, checksUsed, revealsUsed, status } }   # the student's own letters
```

The solution is **never** sent. Checking is done by the server:

| Request | Server reply |
|---|---|
| check cell / word / puzzle (when the preset allows) | for each cell asked: `ok`, `wrong` or `empty`; never the right letter |
| reveal letter (when allowed and under the limit) | that one letter; `reveals_used` is incremented first, atomically |
| 초성 for a word (when allowed) | the consonants only |
| submit | `completed` only if every cell is right; otherwise the number of wrong cells |

Hashing the answers and checking in the browser was rejected: short Korean words can be brute-forced from a hash in a second, and the hashes would sit in the page for anyone to read. Rate limiting: checks per attempt are limited (a constant, 60 per minute) so the check endpoint cannot be used to read the solution cell by cell.

### 5.4 Progress, resume and completion

- **Autosave**: the browser sends the current cells to the server about two seconds after the last change and when the page is hidden; the server stores them on the attempt (`crossword_attempts.cells`). Open the puzzle on another device and the same state resumes.
- **One attempt per student and assignment** in the pilot (a retry policy is a decision for the PM, §10). Completed attempts are read-only; the student can look at the finished grid.
- **Completion** is decided by the server on submit or when a check shows all cells correct. It records `completed_at` and `active_seconds` (sum of intervals with activity, not wall-clock time).
- If the teacher closes the assignment, or the classroom is archived, while a student is playing, the attempt is kept and the screen says "수업에서 닫힌 퍼즐입니다" (read-only); the next save is refused.
- No rankings or leaderboards in the pilot; the student sees their own progress, the teacher sees the class (§10).

### 5.5 Teacher results

Teachers of the classroom (owner, co-teachers, admin) see the roster with status, completion time, checks and reveals used. They do not see other classrooms' students. This view is student data and is covered by the retention and erasure rules (§6.7).

---

## 6. Database impact

Everything below is **additive**. No M1 or M2-1 table is altered, apart from the audit enums.

### 6.1 Migration plan (the existing set ends at `20261017000005`)

| # | File | Contents |
|---|---|---|
| 22 | `…_crossword_enums_audit.sql` | enums `crossword_status` (`draft`, `published`, `archived`), `crossword_level` (`easy`, `normal`, `hard`), `crossword_direction` (`across`, `down`), `crossword_attempt_status` (`in_progress`, `completed`), `crossword_assignment_status` (`open`, `closed`); `audit_resource` += `crossword`; `audit_action` += the six actions of §4.5. Values only, as in M2-1 |
| 23 | `…_crossword_puzzles.sql` | `crossword_puzzles`, `crossword_words`, `crossword_preview_tickets` (like `content_import_batches`: hash and counts only), RLS and teacher policies |
| 24 | `…_crossword_assignments_attempts.sql` | `crossword_assignments`, `crossword_attempts`, RLS (students: no policy) |
| 25 | `…_fn_crossword.sql` | `fn_save_crossword` (create the puzzle and its words in one transaction, validate), `fn_publish_crossword` (validate again, create assignments, audit), `fn_cleanup_crossword_tickets`, the teacher read views |

### 6.2 Tables

```sql
crossword_puzzles
  id uuid pk, school_id uuid not null,
  owner_id uuid not null references profiles(id) on delete restrict,        -- transfer first (P1)
  set_id uuid references content_sets(id) on delete set null,                -- provenance only
  title text not null check (char_length(btrim(title)) between 1 and 80),
  level crossword_level not null,
  settings jsonb not null,            -- the options of §3.1 as used (validated by the application and by fn_save_crossword)
  stats jsonb not null,               -- words, crossings, fill ratio, difficulty score, rows/cols
  seed bigint not null, generator_version smallint not null, placement_hash text not null,
  rows smallint not null check (rows between 2 and 15), cols smallint not null check (cols between 2 and 15),
  status crossword_status not null default 'draft',
  published_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()

crossword_words                        -- the puzzle's own COPY of answer and clue
  id uuid pk, puzzle_id uuid not null references crossword_puzzles(id) on delete cascade,
  number smallint not null check (number > 0),
  direction crossword_direction not null,
  row smallint not null check (row >= 0), col smallint not null check (col >= 0),
  answer text not null check (answer ~ '^[가-힣A-Z0-9]+$'),
  length smallint generated always as (char_length(answer)::smallint) stored,
  clue text not null check (char_length(clue) between 1 and 200),
  source_entry_id uuid references content_entries(id) on delete set null,   -- provenance only
  unique (puzzle_id, direction, number), unique (puzzle_id, row, col, direction),
  check (char_length(answer) between 1 and 15),   -- C1: a one-character word is a one-cell word (single = true)
  single boolean generated always as (char_length(answer) = 1) stored

crossword_assignments
  id uuid pk, puzzle_id uuid not null references crossword_puzzles(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  status crossword_assignment_status not null default 'open',
  opens_at timestamptz, closes_at timestamptz, created_by uuid references profiles(id) on delete set null,
  unique (puzzle_id, classroom_id)

crossword_attempts                     -- STUDENT DATA
  id uuid pk, assignment_id uuid not null references crossword_assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,        -- erasure cascades from the student
  status crossword_attempt_status not null default 'in_progress',
  cells jsonb not null default '{}',   -- {"r,c": "사"} ; at most rows*cols entries, one character each (checked by the save function)
  checks_used smallint not null default 0, reveals_used smallint not null default 0,
  active_seconds integer not null default 0,
  started_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique (assignment_id, student_id)
```

`crossword_preview_tickets` mirrors `content_import_batches`: `actor_id`, `set_id`, `token_hash`, `placement_hash`, `expires_at`, no content.

Constants versus the database: the application bounds (2–15 letters, ≤ 25 words, ≤ 15 × 15) are tighter than the database CHECKs, as in M2-1, and a test pins that.

### 6.3 Indexes

`crossword_words (puzzle_id)`; `crossword_assignments (classroom_id) WHERE status = 'open'`; `crossword_attempts (student_id)` and `(assignment_id)`; `crossword_puzzles (owner_id) WHERE archived_at IS NULL`; a partial unique index for live titles per owner is optional. Sizes are tiny (≤ 25 words per puzzle, one attempt row per student and puzzle).

### 6.4 Row level security

| Table | Teachers (authenticated) | Students | anon |
|---|---|---|---|
| `crossword_puzzles`, `crossword_words` | select if the puzzle's owner, or owner / co-teacher of a classroom it is assigned to, or of the linked set's classroom (same predicate style as `content_sets_select_staff`) | **no policy**: no direct access, so the solution cannot be read with a student's token even through the REST API | none |
| `crossword_assignments` | select for classroom owner / co-teachers and the puzzle owner | none | none |
| `crossword_attempts` | select for teachers of the assignment's classroom | none (all student access goes through server actions that use the service role and check enrollment) | none |
| `crossword_preview_tickets` | none (service role only) | none | none |

All writes go through the service role and the functions of migration 25, as in M1 and M2-1. The decision "students never query these tables" is what makes the no-leak guarantee (§8) testable by one pgTAP file: a student JWT selecting `crossword_words` returns zero rows and `answer` can never appear.

### 6.5 Functions

- `fn_save_crossword(...)`: one transaction: insert the puzzle and words, recompute the placement hash from the stored words, check the letter consistency of crossings (group the expanded cells by `(row, col)`; more than one distinct character is an error), the run check of P4 in SQL, counts and caps. Raises stable codes mapped to Korean messages (the M2-1 pattern).
- `fn_publish_crossword(...)`: re-validates, requires `draft`, requires every classroom to be live and manageable by the actor, creates the assignments, sets `published`, audits. Single transaction; failure leaves a draft.
- `fn_cleanup_crossword_tickets()` like `fn_cleanup_content_import_batches`.

### 6.6 Ownership, deletion and archive

- Puzzles are archive-only (D5); replaced versions stay archived. `owner_id … RESTRICT`: a teacher who owns puzzles cannot be deleted until they are transferred (P1), and `docs/pilot/12` §3.4 deletes puzzles (cascading their words and assignments) before teachers, like content sets.
- Deleting a content set does **not** delete puzzles made from it (`set_id` is `SET NULL`); a puzzle is self-contained.

### 6.7 Governance impact (`docs/pilot/12`)

New rows in §0.1: **crossword attempts** (student data: which student solved what, when, with how many hints) removed when the student's auth user is deleted (cascade through `students`); puzzles and words are teacher content without personal data. §3.3's verify query gains `crossword_attempts`; §3.4 deletes `crossword_puzzles` before teachers; §1 keeps "no free-text profiles". Student attempts are covered by the 30-day retention after the pilot. This update is **required before a real student plays** and needs the data-protection contact's agreement (the signed D6 text then has to include it).

### 6.8 Types and code layout (for the later phases)

`src/features/crossword/generator/` (pure: `constants.ts`, `prng.ts`, `select.ts`, `place.ts`, `score.ts`, `validate.ts`, `number.ts`, `difficulty.ts`, `chosung.ts`), `src/features/crossword/{service,actions,queries}.ts`, `src/features/crossword/play/{payload.ts,check.ts}`, pages under `src/app/teacher/crosswords/**` and `src/app/student/crosswords/**`, components `crossword-grid`, `crossword-clues`, `crossword-hints`, `crossword-review`. The generator imports nothing from Supabase (a test enforces it, as for the M2-1 validators).

---

## 7. Delivery phases

| Phase | Delivers | Needs | Size |
|---|---|---|---|
| M2-2.1 Generator core | pure generator, validator, numbering, difficulty, 초성, constants, property and golden tests | M2-1 only; no database | M (3–4 days) |
| M2-2.2 Schema | migrations 22–25, pgTAP (RLS, student isolation, functions, cascades), types | 2.1 for the placement hash shape | M |
| M2-2.3 Teacher generate, review, publish | pages, preview ticket, save, publish, audit, results skeleton | 2.1, 2.2 | L |
| M2-2.4 Student play | list, play screen, payload, server checks, autosave, completion, IME handling | 2.2, 2.3, **doc 12 updated and D6 signed** | L |
| M2-2.5 Teacher results | per-class results view | 2.4 | S |

2.1 can start immediately and in parallel with the PM decisions that do not touch it; 2.4 must not be deployed to real students before the governance update.

---

## 8. Test plan

**Generator (pure, `tests/access/crossword-*.test.ts`)**
- *Invariants as properties*: for many seeds and word lists (Korean, Latin, mixed, digits), every produced puzzle passes P1–P7 using the independent validator; runs re-extracted from the grid equal the words; connected; letters equal at crossings; within the grid size.
- *Determinism*: same inputs and seed give byte-identical placement and hash; different seeds usually differ; the PRNG has known test vectors.
- *Boundaries with the constants*: `CROSSWORD_MIN_WORDS − 1` words → "no puzzle"; exactly min, exactly `CROSSWORD_MAX_WORDS`, +1 refused; word length 1 excluded, 2 allowed, 15 allowed, 16 excluded (the set cannot hold it anyway); grid size 10/13/15 and a word longer than the grid excluded with its reason.
- *Hard cases*: a word sharing no character (reported, not fatal); all words disjoint (no puzzle); a word that is a substring of another; two words with many shared syllables; decomposed (NFD) input is NFC-normalised before use; digits and mixed answers cross only on equal characters; the worked example of §2.7 produces exactly its numbering.
- *Numbering/clues*: shared number for an across and a down start, order, `(n)` length, masking of an answer inside a clue, no masking for one-character answers.
- *Difficulty*: presets pin their values; the score orders three fixed puzzles easy < normal < hard.
- *Performance*: 25 words within the time budget on CI hardware; the budget is honoured.
- *Purity*: the generator folder imports nothing from Supabase or the audit log.

**Database (pgTAP)**: a student token cannot select `crossword_words`, `crossword_puzzles` or another student's attempt; a teacher of the classroom can; an outsider cannot; `answer` CHECK and generated `length`; unique numbering; `fn_save_crossword` rejects inconsistent crossings and extra runs, wrong hash, over-cap counts; `fn_publish_crossword` refuses an archived classroom, a published puzzle, a classroom the actor cannot manage; deleting a student removes their attempts; deleting an owner who owns puzzles is refused; deleting a set keeps the puzzle.

**Flow (vitest against the local stack)**: generate → ticket → save (set changed in between → refused) → publish → student list shows it → payload contains no answer text (a test searches the whole JSON for every answer) → check cell/word/puzzle replies never contain the right letter → reveal limit atomic under parallel requests → autosave and resume → submit completes only when right → closing the assignment makes the next save fail → archived classroom blocks play → audit rows contain no text.

**Manual**: IME typing on the school's devices (Windows, Chromebook, iPad, phone), keyboard-only play, screen reader smoke test, printing the page (browser print stylesheet only).

---

## 9. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Korean IME composition in a one-character cell | students cannot type syllables, or letters are lost | build the cell around composition events, test on real devices early (M2-2.4 starts with a spike) |
| Small or unrelated vocabulary sets give small puzzles | Crossing needs the same syllable. Measured in M2-2.1: a 25-word list that chains (사과, 과일, 일기, ...) places 17 words; a 20-word science list 10; a 20-word civics list (민주주의, 삼권분립, 헌법, ...) **only 4**, and an exhaustive search confirms 4 is the maximum, so the generator refuses it (fewer than five) instead of faking it | Report why (shown words, unplaced words with reasons); suggest adding words with common syllables; allow the teacher to lower the minimum; keep the words-per-set guidance in the teacher help text |
| Solution leak through any new endpoint | students read answers | no student policy on the tables, a payload builder with an allow-list of fields, a test that greps the payload for every answer |
| Brute-force through the check endpoint | solution read cell by cell | cell-level feedback only where the preset allows, rate limit, counters recorded |
| Generator change after teachers saved puzzles | saved puzzles must not change | puzzles store the words and positions, not a recipe; `generator_version` is for regeneration only |
| Student data (attempts) not yet in the governance text | cannot go live | update `12` first (§6.7), part of 2.4's entry criteria |
| Request time limit of the host | slow generation | budget 800 ms, best-so-far result, constants measured on the host before 2.3 ships |
| Hand-edited grids | invalid puzzles | not allowed in v1; validators on every save |

---

## 10. Open decisions for the PM

| # | Decision | Recommendation |
|---|---|---|
| C1 | ~~Minimum word length~~ **Decided by the PM: one-character words are allowed.** Implemented as one-cell words (§0 item 5); they do not count toward the minimum of five words | Decided, implemented in M2-2.1 |
| C2 | Difficulty presets (§3.1): sizes, word counts, pre-filled share, reveals, check modes | Accept as the starting values; review with a teacher after the first classroom test |
| C3 | Feedback while playing: allow checking at any time on easy, only on submit on hard | Yes, per preset (§3.1) |
| C4 | 초성 hint for Korean words | Yes on easy and normal, not on hard |
| C5 | Attempts per student and puzzle | One attempt in the pilot; a "reset my attempt" button for the teacher later |
| C6 | Results visible to the student and the classroom's teachers only; no rankings or leaderboards | Yes (privacy and classroom climate); revisit only on request |
| C7 | ~~Scripts~~ **Decided by the PM: Hangul, Latin and digits are allowed; emoji and symbol answers are rejected** | Decided, implemented in M2-2.1 |
| C8 | Clue masking when the clue contains the answer | On by default, listed on the review screen |
| C9 | One puzzle published to several classrooms of the same teacher | Yes (assignments table); each classroom has its own attempts |
| C10 | A published puzzle is frozen; changes mean a new version | Yes |
| C11 | Time limits and countdowns | None in the pilot |
| C12 | Printing | Browser print of the review page only; no PDF generation (consistent with M2-1 scope) |
| C13 | Governance: add crossword attempts to `docs/pilot/12` and `13` and get the data-protection contact's agreement **before 2.4** | Required; owner: PM with the school contact |
| C14 | Whether M2-2.1 (pure generator) may start before C2–C12 are answered | Yes: the numbers are constants; only C1 and C7 touch it |
