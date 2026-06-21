# Client Requirement — <App Name>

> **Status: TEMPLATE — to be filled in.**
> Paste the app brief here. This is the source of truth for *what* we build.
> The `leader` and `spec_author` read this first. Be concrete; ambiguity here
> becomes rework later.

## 1. One-line summary

_What is this app, in a sentence?_

## 2. Problem & goal

_What problem does it solve, for whom, and what does success look like?_

## 3. Users & roles

| Role | Can do | Cannot do |
|---|---|---|
| _e.g. Owner_ | | |
| _e.g. Member_ | | |
| _Anonymous_ | | |

## 4. Core features

_List the features. Each becomes one or more entries in `feature_list.json`.
Keep them small and independently shippable._

1. **<Feature>** — _description; user story; acceptance criteria._
2. ...

## 5. Data / domain model (rough)

_Key entities and their relationships (the architect will refine into Prisma
schema). e.g. User 1—* Board 1—* Column 1—* Card._

## 6. Auth & permissions

_How do users sign in (email/password, magic link, OAuth provider)? What is
each role allowed to read/write? Any row-level ownership rules?_

## 7. Drag & drop (dnd-kit) scope

_What is draggable/sortable? How is order persisted? Keyboard accessibility
expectations?_

## 8. Files / Storage (Supabase Storage)

_What files are uploaded, by whom, size/type limits, public vs private buckets?_

## 9. Non-functional requirements

_Performance, accessibility, i18n, SEO, offline, mobile, analytics, etc._

## 10. Out of scope (for now)

_Explicitly list what we are NOT building, to prevent scope creep._

## 11. Open questions

_Anything undecided that needs a human answer before specs are written._
