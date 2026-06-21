# AGENTS.md — Navigation map for AI agents

> This file is the **entry point** for any agent working in this repository.
> It is NOT a rulebook: it is a **map**. Read only what you need, when you need
> it (progressive disclosure).

---

## 1. Before you start (mandatory)

1. Read `progress/current.md` to understand where the last session left off.
2. Read `feature_list.json`. Every new feature (`"sdd": true`) goes through
   **Spec-Driven Development** — see `docs/specs.md` and §4 of this file.
3. Read `docs/specs.md` before touching any spec or `sdd: true` feature.

## 2. Repository map

| File / folder              | What it contains                                                                 | When to read it |
|----------------------------|----------------------------------------------------------------------------------|-----------------|
| `feature_list.json`        | Task list with status (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`) | Always, at start |
| `progress/current.md`      | Current session state                                                            | Always, at start |
| `progress/history.md`      | Append-only log of previous sessions                                             | If you need historical context |
| `specs/<feature>/`         | `requirements.md` + `design.md` + `tasks.md` (Kiro-style)                        | Before implementing any `"sdd": true` feature |
| `docs/architecture.md`     | What "doing a good job" means in this project (org model, design patterns)       | Before implementing |
| `docs/conventions.md`      | Apex/LWC style, naming, metadata structure                                       | Before writing code |
| `docs/specs.md`            | SDD process: EARS notation, the 3 files, human approval gate                     | Before drafting or reading a spec |
| `docs/verification.md`     | How to verify your work (Apex tests, coverage, requirement traceability)         | Before declaring a task `done` |
| `CHECKPOINTS.md`           | Objective criteria for "correct final state"                                     | To self-evaluate |
| `.claude/agents/`          | Subagent definitions (`leader`, `spec_author`, `implementer`, `reviewer`)        | If you orchestrate work |
| `force-app/main/default/`  | Salesforce metadata (Apex, LWC, objects, flows)                                  | To implement |
| `tests/` & `**/*_Test.cls` | Apex tests and LWC Jest tests                                                     | To verify |

## 3. Hard rules (non-negotiable)

- **One feature at a time.** Do not mix changes from several tasks in one session.
- **Never declare a task `done` without green tests.** make
  sure the Apex test block passes 85% and meets the coverage threshold.
- **Never skip the spec phase.** Every `"sdd": true` feature must go through
  `spec_author` and get human approval before any metadata changes.
- **Never skip the human approval gate.** The leader stops at `spec_ready` and
  waits.
- **Never deploy to production.** Validation against sandbox/scratch only.
- **Never modify a Salesforce org manually** outside the source-driven flow.
- **Document as you go** in `progress/current.md`, not at the end.
- **Leave the repository clean** before closing the session (see §5).
- **If you don't know something, look in `docs/`** before inventing it.

## 4. Workflow (SDD)

```
pending → [spec_author] → spec_ready → ⏸ HUMAN → in_progress → [implementer → reviewer] → done
```

1. The leader detects the first `pending` feature with `"sdd": true`.
2. The leader launches `spec_author`, which creates
   `specs/<name>/{requirements,design,tasks}.md` and sets the status to
   `spec_ready`.
3. **Pause.** The human reads the spec in `specs/<name>/` and approves (or
   requests changes).
4. Once approved, the leader sets the status to `in_progress` and launches
   `implementer`.
5. The implementer executes `tasks.md` one by one, marking each `[x]`.
6. The reviewer verifies `R<n>` ↔ test traceability and task completeness;
   approves or rejects.
7. If approved, the implementer marks `done` and moves the summary to
   `progress/history.md`.

## 5. Session close (lifecycle)

Before finishing:

1. If the task is finished: set `status: "done"` in `feature_list.json`.
2. Move the `progress/current.md` summary to the end of `progress/history.md`.
3. Empty `progress/current.md`, leaving only the template.
4. Leave no temp files, no `System.debug()` left in for debugging, no TODOs
   without context.

## 6. If you get stuck

- Re-read the relevant section of `docs/`.
- If a tool doesn't behave as expected, **do not invent a workaround**:
  document the blocker in `progress/current.md` and stop the session.
