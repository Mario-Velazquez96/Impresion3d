# Requirements Document
## Management Portal — 3D Printing Business

**Version 1.1**
**June 20, 2026**

---

## 1. Project Summary

Internal web portal to manage the operations of a 3D printing business run by two partners. The system centralizes task management, supply expense tracking, and a print inventory, and includes a weekly planning tool that helps decide what to print each day based on the filament colors available.

The project must be built on a scalable architecture that allows new features to be added in the future (for example, quotes) without needing to redesign the foundation.

### 1.1 Business Objectives

- Have visibility and tracking of the business's operational tasks.
- Record supply expenses in an organized way.
- Maintain a searchable inventory of available prints.
- Plan the printing week while accounting for the filament-drying logistics caused by humidity.
- Have a scalable technical foundation for future features.

### 1.2 Key Operational Context

The business operates in a high-humidity city, so filaments must be dried a day before being used. This requires planning ahead which colors will be dried and, therefore, which prints can be produced during the week. This constraint is the origin of the planning and color-filtering feature.

---

## 2. Scope

### 2.1 In Scope (MVP)

- User and role management (Admin / Employee).
- Kanban-style task module with subtasks.
- Supply expense tracking module.
- Print inventory module.
- Weekly planning module with color filtering.
- Manageable catalogs for colors and print types.

### 2.2 Out of Scope (for now)

- Offline functionality.
- Native mobile application (intended use: desktop computer).
- Quotes (considered a future feature).
- Automatic linking between filament expenses and the color inventory.
- Public portal / customer-facing catalog.

---

## 3. Users and Roles

The system launches with 2 users (both administrators) and must support up to a maximum of 5 users within a 12-month horizon.

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage users, catalogs, tasks, expenses, inventory, and planning. |
| **Employee** | Operational access: create and update tasks, record expenses, view inventory and planning. No user or catalog management (to be confirmed in detail). |

> **Note:** even though both users are Admins today, the system must account for the Employee role from the start to avoid rework.

---

## 4. Functional Requirements

### 4.1 Task Module (Kanban)

Kanban-style board with draggable columns (drag & drop). Each task can have subtasks.

**States (columns)**

Backlog · Todo · In Progress · Pending · Blocker · Done

**Task attributes**

- Title
- Description
- Category (manageable catalog — see 4.6)
- State / column
- Assigned owner (one of the users)
- Due date
- Subtasks (list, each with its own completion state)

**Initial task categories**

Printer maintenance · Design creation · Purchases · Customer follow-up.

Categories must be able to be added / edited in the future.

**Expected capabilities**

- Move tasks between columns by dragging.
- Filter tasks by owner, category, and state.
- View and check off subtasks within each task.

### 4.2 Expense Tracking Module

Simple recording of supply expenses. At this stage, only recording is required (no automatic reports or totals).

**Expense attributes**

| Field | Description |
|-------|-------------|
| **Cost** | Expense amount. |
| **Reason** | Reason or description of the expense. |
| **Date** | Date of the expense. |
| **Purchase link** | Reference URL for the purchase. |
| **Supply type** | Supply category (e.g., filament, spare part, tool). |

> **Future:** reports and totals (expense per month, per supply type). The data model must be prepared for this.

### 4.3 Print Inventory Module

Catalog of prints the business is already able to produce. Each record stores the information needed to identify it and to support color-based planning.

**Print attributes**

| Field | Description |
|-------|-------------|
| **Name / model** | Print identifier. |
| **Colors used** | One or more colors from the catalog. Key for planning filters. |
| **Print time** | Estimated print duration. |
| **Filament grams** | Total amount of filament used. |
| **Photo** | Image of the print. |
| **Document link** | URL to the model file / document. |
| **Print type** | Manageable catalog (e.g., keychain, frame, deckbox). |

> **Note:** only the colors used by the print are recorded (multiple), without breaking down grams per color.

### 4.4 Weekly Planning Module

Central tool for organizing the printing week while accounting for filament pre-drying.

**Usage flow**

1. The user selects which colors will be dried (e.g., Piel, Café, Azul, etc.).
2. The system filters from the inventory the prints that can be produced with those available colors.
3. The user chooses which prints to make and assigns them to specific days of the week.
4. The weekly view shows what will be printed each day and which colors must be ready.

**Expected capabilities**

- Select the set of colors available for the week.
- Filter the inventory by those colors.
- Assign prints to days (Monday through Sunday).
- Indicate which colors to dry the day before each print.

**Color filtering modes**

The module offers two views to filter the inventory based on the colors available that week:

- **Full match (default view):** shows only the prints whose colors are ALL available. These can be printed with no pending items.
- **Partial match (additional button):** shows prints that match at least one of the available colors, indicating which colors would be missing. Useful for evaluating what else could be dried or adjusted.

### 4.5 Color Catalog

Fixed color catalog, manageable by an Admin. Each color has a name and, preferably, a color swatch (hex) to identify it visually in the filters.

Initial color catalog:

- Azul Ballena MM
- Café Moka MM
- Piel MM
- Verde Iguana MM
- Rojo Cochinilla MM
- Rojo Nochebuena MM

### 4.6 Manageable Catalogs

To support growth, the following catalogs must be editable without code changes:

- Task categories.
- Print types (keychain, frame, deckbox, etc.) — confirmed as manageable.
- Supply types (for expenses).
- Colors.

---

## 5. Non-Functional Requirements

- **Scalability:** modular architecture that allows new features (e.g., quotes) to be added without redesigning the foundation.
- **Platform:** web application optimized for desktop (responsive desirable, not mandatory for MVP).
- **Concurrent users:** up to 5 users.
- **Authentication:** login with role-based access control (Admin / Employee).
- **Image storage:** support for print photos.
- **Availability:** online use; no offline mode required.

---

## 6. Future Features (not in MVP)

- Quotes module.
- Expense reports and totals.
- Linking between filament expenses and the color inventory (filament stock control).
- Access from mobile devices / app.
- Customer order management.

---

## 7. Open Questions and Pending Decisions

Closed decisions: color catalog defined, print types manageable, and planning filter with a full-match view (default) plus a partial-match button.

Pending minor items to define during detailed design:

1. Define the exact scope of the Employee role's permissions.
2. Define whether print time and grams will be free-text or structured fields.
