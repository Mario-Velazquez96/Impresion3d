# docs/conventions.md — Style, naming, structure

Read before writing any metadata.

## Project structure (source format)

```
force-app/main/default/
  classes/        Apex classes and *_Test classes
  triggers/       one trigger per object
  lwc/            Lightning Web Components
  objects/        custom objects, fields, validation rules
  flows/          flows
  permissionsets/ permission sets
```

`sfdx-project.json` is authoritative — never bypass it.

## Apex

- **Naming:** `PascalCase` classes, `camelCase` methods/variables, test classes
  suffixed `_Test`.
- **Triggers:** one trigger per object; all logic in a handler class
  (`<Object>TriggerHandler`).
- **Bulkification:** assume 200-record batches. No SOQL or DML inside loops.
- **Security:** `with sharing` by default; enforce CRUD/FLS; use
  `Security.stripInaccessible` or `WITH SECURITY_ENFORCED` where appropriate.
- **Coverage:** ≥ 85% per class; assertions must be meaningful, not just lines
  executed. Cover positive, negative, and bulk paths.
- No leftover `System.debug()` in committed code.

## Lightning Web Components

- Folder and file names in `camelCase`.
- No hardcoded IDs, labels, or URLs — use Custom Labels and metadata.
- Keep components focused; extract reusable logic into service modules.
- Jest unit tests for component logic.

## Metadata

- API names follow existing project patterns; custom suffix `__c`.
- Never introduce an object/field that is not described in an approved spec.

