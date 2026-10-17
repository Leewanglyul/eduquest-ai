# M2 design documents

| # | Document | Purpose |
|---|---|---|
| 1 | [CSV content pipeline](01-csv-content-pipeline.md) | Design of M2-1: teacher CSV upload (`term,definition`) into word sets for later question, crossword and game generation: schema, database and RLS, upload workflow, validation and messages, storage model, teacher management workflow, future consumers, test plan, open decisions |
| 2 | [M2-1 implementation plan](02-implementation-plan.md) | Phases M2-1.1 Schema, 1.3 Validation, 1.2 Upload, 1.4 Teacher management, 1.5 Export: build order, gating decisions, migration / service / UI / test file lists, exit criteria |

Design only; no application code or migrations exist for M2 yet.
