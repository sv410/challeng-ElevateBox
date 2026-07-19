# Design Documentation: Controlled Document Approval System

This design note covers the invariants, security boundaries, concurrency model, and architectural trade-offs of the implementation.

---

### 1. Most Important Invariants in the System
* **State Machine Invariants**: A document can only advance through strict state paths:
  * `draft` / `rejected` ➔ `submitted`
  * `submitted` ➔ `approved` or `rejected`
  * `approved` ➔ `published`
  * Any state (except `archived`) ➔ `archived`
* **Ownership Invariant**: Only the original creator (author) can edit or submit a draft.
* **Separation of Duties (No Self-Approval)**: An author can never approve or reject their own document, even if they have the reviewer role.
* **Audit Trail Invariant**: Every state-changing action must create a matching chronological audit log entry.
* **Concurrency Invariant**: Stale updates from out-of-date client screens must be rejected instead of silently overwriting newer data.

---

### 2. Database vs. Application-Enforced Invariants
* **Database Constraints**:
  * **Unique Emails**: Enforced using `UNIQUE INDEX` on `users.email`.
  * **Data Integrity**: Enforced using SQLite Foreign Keys (`author_id` referencing `users.id`, `document_id` referencing `documents.id`, `actor_id` referencing `users.id`).
  * **NotNull Constraints**: Titles, bodies, and statuses are declared `.notNull()` to prevent null value pollution at the DB layer.
* **Application Code Constraints**:
  * **Workflow transitions & permissions**: Validated inside `src/lib/server/workflow.ts` within the transaction block.
  * **Content validation**: Checking for non-empty title/body trim states.
  * **Self-review protection**: Block validation preventing matching author and actor IDs during approval/rejection.

---

### 3. Permissions Architecture
Permissions are managed on the server using **Role-Based Access Control (RBAC)** coupled with **Ownership Rules**:
* Every request is authenticated on the server (using session cookies) to fetch the current user's profile and role.
* Before any action is executed, the server queries the database inside a transaction to check the user's role and the document owner's ID.
* For read operations, SvelteKit loaders query only the slice of documents visible to the user:
  * `viewer`: Can only load `published` documents.
  * `author`: Can load `published` documents and their own private documents.
  * `reviewer`: Can load `published` documents, `submitted` documents, and their own private documents.
  * `admin`: Can load all documents in the database.

---

### 4. Concurrency Control (Preventing Stale Writes)
We implement **Optimistic Concurrency Control (OCC)** using a `version` integer column on the `documents` table:
1. Every write/read loads the document's current `version` along with its content.
2. The client submits the `version` it is acting upon (the `expectedVersion`) during any update action (edit, submit, approve, reject, publish, archive).
3. The server transaction checks: `SELECT version FROM documents WHERE id = docId`. If the database version is not equal to `expectedVersion`, the transaction is aborted and a `VERSION_CONFLICT` (HTTP 409) is returned.
4. If they match, the version is incremented to `version + 1` in the database, and the audit log is written with the new version.

---

### 5. Keeping Audit Events Consistent with Document Changes
Consistency is guaranteed by executing both the document state change and the audit log insertion within a **single SQLite database transaction** (`db.transaction`).
* If the document update fails (due to a version conflict, DB error, or validation failure), the transaction rolls back, and no audit log is written.
* If the audit log insertion fails, the transaction rolls back, and the document is not modified.
* Because `better-sqlite3` runs synchronously, transactions commit immediately within the same thread execution block, preventing nested concurrency or dangling promises.

---

### 6. Failure Cases Considered
* **Concurrent Review and Rejection**: Bob approves a document, while Carol (looking at the same screen state) clicks reject. Carol's request fails cleanly with a `VERSION_CONFLICT` error, keeping the document status as `approved` without silent data loss.
* **Author Impersonation**: Hitting API endpoints directly with a forged email is blocked because the server validates the user's role and ownership status directly in the database transaction using the secure session cookie.
* **Empty Rejection Reason**: Rejections submitted without a comment are blocked at the transaction level.
* **Self-Approval / Bypass**: A reviewer who attempts to approve a document they authored is blocked on the server, even if they bypass the UI and call the action endpoint directly.

---

### 7. What Would You Improve with More Time?
* **Real-time Updates**: Integrate WebSockets or Server-Sent Events (SSE) so the UI updates instantly when another user modifies a document, reducing occurrence of optimistic concurrency rollbacks.
* **Audit Trail Diffing**: Display visual diffs (additions/deletions) in the audit timeline showing exactly what words changed during an edit.
* **Soft Deletes**: Build a restore function for archived documents so admins can undo archiving actions.

---

### 8. What Needs to Change for a Real Production System?
* **Production Auth**: Replace the session switcher cookie with a secure production-grade auth provider (like Auth0, Clerk, or Lucide Auth) using JWTs or secure session stores.
* **Distributed Database**: Switch from a local SQLite file to a distributed SQLite cluster (like Turso/libSQL) or a PostgreSQL database to handle scaling, database replication, and automated backups.
* **Distributed Transactions**: If audit logging is offloaded to a separate search service (like Elasticsearch), we would need a transactional outbox pattern to ensure eventual consistency.
