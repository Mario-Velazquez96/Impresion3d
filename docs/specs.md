# docs/specs.md — Spec-Driven Development process

This project uses a Kiro-style, three-file spec per feature plus a human
approval gate. Read this before drafting or reading any spec.

## The three files

Each `"sdd": true` feature gets a folder `specs/<feature>/` with:

| File | Purpose |
|---|---|
| `requirements.md` | What and why. User stories + acceptance criteria in EARS notation, numbered `R1…Rn`. Scope and out-of-scope. |
| `design.md` | How. Technical approach, data model, Apex/LWC design, sharing/security, governor-limit considerations. |
| `tasks.md` | Ordered, checkable implementation steps. Each task cites the requirement(s) it satisfies. |

## EARS notation

Write acceptance criteria as structured EARS statements so they are testable:

- **Ubiquitous:** "The system shall <response>."
- **Event-driven:** "When <trigger>, the system shall <response>."
- **State-driven:** "While <state>, the system shall <response>."
- **Unwanted behavior:** "If <condition>, then the system shall <response>."
- **Optional:** "Where <feature included>, the system shall <response>."

Salesforce example:
> **R3 (Event-driven):** When an Opportunity is set to Closed Won, the system
> shall create a renewal Opportunity dated one year later.

## The human approval gate

```
pending → [spec_author] → spec_ready → ⏸ HUMAN → in_progress → [implementer → reviewer] → done
```

When a spec reaches `spec_ready`, the leader **stops**. A human reviews the
three files and either approves (status → `in_progress`) or requests changes
(spec_author revises). Implementation never begins before approval.

## Traceability contract

Every `R<n>` must be traceable to at least one test. The reviewer enforces this:
a requirement with no corresponding test is an automatic rejection.
