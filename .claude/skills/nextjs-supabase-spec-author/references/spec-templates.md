# Spec templates

Use these templates verbatim (adapting content). Keep the headings — the SDD
harness and reviewer rely on them.

---

## requirements.md

```markdown
# Requirements — <NN_feature_name>

**Feature:** <one-line name>
**Source:** <source doc + section refs, e.g. PRD §3, design §2.1>
**Depends on:** <comma-separated feature names, or "none (foundation layer)">

## Purpose

<2–4 sentences: what this feature delivers and why; what it does NOT include.>

## In scope

- <concrete artifacts: tables, RLS policies, Prisma models, server actions,
  routes, components>

## Out of scope

- <what belongs to other features; name them>

## Requirements (EARS)

**R1 (<EARS type>):** The system shall <...>.
**R2 (<EARS type>):** When <trigger>, the system shall <...>.
**R3 (<EARS type>):** If <condition>, then the system shall <...>.
<number every requirement so tests trace to R<n>. Make RLS/auth rules explicit
requirements, e.g. "If a user requests a row they don't own, then the query shall
return no rows.">

## Acceptance

<observable end state that proves the feature works; reference source verification
scenarios if any. For UI, include accessibility criteria.>

## Open items

<inconsistencies or unconfirmed assumptions for the human to resolve at the
approval gate; omit the section if none>
```

---

## design.md

```markdown
# Design — <NN_feature_name>

**Source:** <source doc + section refs>

## Approach

<how it's built; note the layer: schema/RLS vs data access vs server actions vs
UI vs realtime>

## <Schema / RLS / File layout / Components>

<For schema: Prisma model + the migration, plus the RLS policies (SQL) and where
they live. For server: the App Router file layout, Server vs Client boundary, the
server actions and their Zod schemas. For UI: routes, components, shadcn pieces.
For dnd-kit: the optimistic-update + rollback strategy and the ordering column.>

## Auth & security

<who can do what; getUser() checks; RLS posture; never module-scope the Supabase
client; secrets server-only>

## Validation

<Zod schemas for each input>

## Test approach

<unit/component/E2E split, the RLS denial test, coverage or "what proves done"
target>

## Open items / discrepancies

<repeat the most important flag for the human>
```

---

## tasks.md

```markdown
# Tasks — <NN_feature_name>

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] <task> (R1)
- [ ] <task> (R2, R3)
- [ ] <blocking decision task if there's an open item>
- [ ] Write tests: <unit/component/E2E> asserting R1–Rn
- [ ] Write the RLS denial test (user cannot access another user's data)
- [ ] Verify build + typecheck + lint pass; confirm <coverage/target>

## Verification

<exact commands/scenarios that prove done; map each R<n> to its test>
```

---

## feature_list.json schema

```json
{
  "features": [
    {
      "name": "01_schema_and_rls",
      "description": "<short summary>",
      "sdd": true,
      "status": "spec_ready",
      "depends_on": []
    },
    {
      "name": "02_data_access",
      "description": "<short summary>",
      "sdd": true,
      "status": "spec_ready",
      "depends_on": ["01_schema_and_rls"]
    }
  ]
}
```

Status values: `pending` → `spec_ready` → `in_progress` → `done` (or `blocked`).
This skill always outputs `spec_ready`. When merging into an existing file,
preserve entries already at `in_progress` or `done`.
