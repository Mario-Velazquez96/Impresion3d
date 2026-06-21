# docs/architecture.md — What "a good job" means here

Read before implementing. This is the project's definition of quality.

## Org model

- This is a **source-driven** project. The Git repository is the source of
  truth, not any org. Orgs are disposable targets (scratch/sandbox).
- Use the manifest/package.xml to add all the files that has been updated

## Design patterns we follow

- **Trigger framework:** one trigger per object → handler class → service layer.
  Keep triggers logic-free.
- **Separation of concerns:** selectors for SOQL, services for business logic,
  domain classes for record-level behavior.
- **No business logic in LWC controllers** beyond presentation; push logic to
  Apex services.

## Non-functionals

- Respect governor limits by design, not by luck. Bulk-safe always.
- Security first: enforce CRUD/FLS and sharing; never widen access to make a
  test pass.
- Idempotent automation: re-running should not create duplicates.

## What "done" looks like

- All `tasks.md` items complete and checked.
- All requirements `R<n>` traced to passing tests.
- Coverage target met; deployment validates against a sandbox org.
- Reviewer has approved.

> Fill in the bracketed/project-specific parts with your real org details.
