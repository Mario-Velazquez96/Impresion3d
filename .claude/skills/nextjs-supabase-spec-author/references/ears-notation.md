# EARS notation for requirements

EARS (Easy Approach to Requirements Syntax) gives requirements a consistent,
testable shape. Each maps cleanly to a test, which makes the SDD traceability
contract (`R<n>` ↔ test) enforceable.

## The five patterns

| Pattern | Template | Use for |
|---|---|---|
| **Ubiquitous** | The system shall `<response>`. | Always-true properties (a table has RLS enabled; a route is server-rendered). |
| **Event-driven** | When `<trigger>`, the system shall `<response>`. | Response to an event (form submitted, card dropped). |
| **State-driven** | While `<state>`, the system shall `<response>`. | Behavior during a condition (while unauthenticated, redirect to login). |
| **Unwanted behavior** | If `<condition>`, then the system shall `<response>`. | Guards and failure paths (if the persist fails, roll back). |
| **Optional** | Where `<feature included>`, the system shall `<response>`. | Behavior tied to an optional element. |

## Rules for good requirements

- **One requirement, one testable claim.** Split "and"-joined behaviors.
- **Number every requirement** (`R1`, `R2`, …).
- **Name concrete artifacts** (table, column, route path, server-action name,
  component) so the implementer doesn't guess.
- **Make security explicit.** RLS and auth rules are requirements, not asides.
- **Prefer the most specific pattern.** A failure path is "If… then", not a vague
  "handle errors".

## Web stack examples

**Ubiquitous (RLS as a requirement):**
> **R1:** The `boards` table shall have RLS enabled with a policy allowing a row
> only when `auth.uid() = boards.owner_id`.

**Event-driven (server action):**
> **R2:** When the create-board form is submitted, the system shall validate the
> input with the `createBoardSchema` Zod schema and insert a row owned by the
> current user.

**State-driven (route protection):**
> **R3:** While the request has no authenticated user, the system shall redirect
> `/dashboard` to `/login`.

**Unwanted behavior (auth guard):**
> **R4:** If a user requests a board they do not own, then the query shall return
> no rows (enforced by RLS, not only by app-layer checks).

**Unwanted behavior (dnd-kit rollback):**
> **R5:** If persisting a card reorder fails, then the system shall restore the
> previous order in the UI and surface an error toast.

**Event-driven (optimistic update):**
> **R6:** When a card is dropped in a new position, the system shall update local
> order immediately and persist the new `position` via the `reorderCard` action.

**Optional (realtime):**
> **R7:** Where realtime is enabled for the board, the system shall apply remote
> card moves from other clients without a full refetch.

## Anti-patterns to avoid

- "The system shall be secure / fast / responsive." — not testable.
- "Handle the drag and drop." — names no trigger, no response, no failure path.
- Leaving RLS implicit. If a table holds user data, its access rule is a numbered
  requirement with a denial test.
- Bundling optimistic update + persistence + rollback into one R. Split them; the
  reviewer checks each `R<n>` has a test.
