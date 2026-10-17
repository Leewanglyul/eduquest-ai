# M2 design documents

| # | Document | Purpose |
|---|---|---|
| 1 | [CSV content pipeline](01-csv-content-pipeline.md) | Design of M2-1: teacher CSV upload (`term,definition`) into word sets for later question, crossword and game generation: schema, database and RLS, upload workflow, validation and messages, storage model, teacher management workflow, future consumers, test plan, open decisions |
| 2 | [M2-1 implementation plan](02-implementation-plan.md) | Phases M2-1.1 Schema, 1.3 Validation, 1.2 Upload, 1.4 Teacher management, 1.5 Export: build order, gating decisions, migration / service / UI / test file lists, exit criteria |
| 3 | [Implementation review](03-implementation-review.md) | M2-1.1 / 1.3 review package with a resolution table |
| 4 | [Crossword generator (M2-2)](04-crossword-generator.md) | Design of the crossword generator: grid strategy, placement algorithm, difficulty rules, teacher review workflow, student play workflow, database impact, phases, tests, open decisions |
| 5 | [M2-2.2 teacher review plan](05-m2-2-2-teacher-review-plan.md) | Implementation plan for the teacher side of the crossword: readiness score, unlimited regenerate, draft review, publish, immutability, migrations 22-24, services, screens, tests, open questions |

Documents 1–3 describe M2-1, which is implemented on `m2/m2-1-content-pipeline`. Document 4 is design only: no code, migration or test exists for M2-2 yet.
