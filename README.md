# Controlled Document Approval System

A full-stack, secure, audit-logged document management and workflow approval system built for the ElevateBox engineering challenge.

It enforces a strict state machine, role-based authorization, optimistic concurrency control, and transactional append-only audit logging.

---

## Technical Stack
* **Framework**: SvelteKit 2 + Svelte 5 (Typescript)
* **Styling**: Vanilla CSS (highly aesthetic, dark mode, responsive split-pane layout)
* **Database**: SQLite (`better-sqlite3`)
* **DB Tool / ORM**: Drizzle ORM
* **Test Runner**: Vitest

---

## Core Features Implemented

1. **Seeded Login Authentication**: Simulate logging in as any of the four roles. A quick switch bar at the top of the screen allows you to swap roles instantly during testing.
2. **State Machine Transitions**: Transitions are fully enforced on the server-side inside transactions:
   * `draft` / `rejected` ➔ `submitted` (Author owner only)
   * `submitted` ➔ `approved` / `rejected` (Reviewer only, excluding document owner)
   * `approved` ➔ `published` (Reviewer or Admin)
   * `draft` / `submitted` / `approved` / `published` ➔ `archived` (Admin only)
3. **Optimistic Concurrency Control**: A document `version` counter blocks stale edits or reviews. If Carol attempts to reject a document that Bob approved in the background, Carol is presented with a clear warning and her action is rejected.
4. **Append-Only Audit Trail**: Every single state-changing action is committed in a single database transaction alongside its state change, guaranteeing that no state changes can occur without a corresponding audit event log.

---

## Seeded Login Credentials

Select or impersonate any of the following users:
* **Alice (Author)**: `alice@example.com`
* **Bob (Reviewer)**: `bob@example.com`
* **Admin (Admin)**: `admin@example.com`
* **Viewer (Viewer)**: `viewer@example.com`

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Push Database Schema
Ensure the SQLite database file and tables are created by pushing the Drizzle schema:
```bash
npm run db:push -- --force
```

### 3. Run the Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser. The database will automatically seed with the four default users upon startup.

---

## Running Tests

Execute the Vitest suite to verify all the workflow transition constraints, authorization blocks, and concurrency safety rules:
```bash
npm run test
```
All 13 tests cover the complete server-side security checks and optimistic lock boundaries.
