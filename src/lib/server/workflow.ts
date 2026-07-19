import { db } from './db';
import { documents, auditLogs, users } from './db/schema';
import { eq } from 'drizzle-orm';

export class WorkflowError extends Error {
	constructor(
		public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'VERSION_CONFLICT',
		message: string
	) {
		super(message);
		this.name = 'WorkflowError';
	}
}

interface Actor {
	id: number;
	email: string;
	name: string;
	role: 'viewer' | 'author' | 'reviewer' | 'admin';
}

/**
 * Enforce that the user is authenticated and return them synchronously
 */
function getActor(tx: any, actorId: number): Actor {
	const user = tx.select().from(users).where(eq(users.id, actorId)).all();
	if (user.length === 0) {
		throw new WorkflowError('UNAUTHORIZED', 'User not found or unauthenticated.');
	}
	return user[0] as Actor;
}

/**
 * Enforce version match and state machine transitions in a synchronous transaction
 */
export async function createDocument(actorId: number, title: string, body: string) {
	// better-sqlite3 transactions must be synchronous
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		// Rule: Only authors can create documents
		if (actor.role !== 'author') {
			throw new WorkflowError('FORBIDDEN', 'Only authors can create documents.');
		}

		// Rule: Empty title or body is rejected
		if (!title.trim() || !body.trim()) {
			throw new WorkflowError('BAD_REQUEST', 'Title and body cannot be empty.');
		}

		const docId = crypto.randomUUID();
		const timestamp = Date.now();
		const version = 1;

		// 1. Create document
		tx.insert(documents).values({
			id: docId,
			title: title.trim(),
			body: body.trim(),
			status: 'draft',
			authorId: actor.id,
			version,
			createdAt: timestamp,
			updatedAt: timestamp
		}).run();

		// 2. Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'create',
			fromStatus: null,
			toStatus: 'draft',
			comment: null,
			version,
			timestamp
		}).run();

		return docId;
	});
}

export async function editDocument(
	actorId: number,
	docId: string,
	title: string,
	body: string,
	expectedVersion: number
) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		// Rule: Stale updates never silently overwrite newer updates
		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: Only the owner (author) can edit
		if (document.authorId !== actor.id) {
			throw new WorkflowError('FORBIDDEN', 'You do not own this document.');
		}

		// Rule: Authors can only edit their own draft or rejected documents
		if (document.status !== 'draft' && document.status !== 'rejected') {
			throw new WorkflowError(
				'FORBIDDEN',
				`Cannot edit a document in ${document.status} status.`
			);
		}

		// Rule: Empty title or body is rejected
		if (!title.trim() || !body.trim()) {
			throw new WorkflowError('BAD_REQUEST', 'Title and body cannot be empty.');
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document
		tx.update(documents)
			.set({
				title: title.trim(),
				body: body.trim(),
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'edit',
			fromStatus: document.status,
			toStatus: document.status,
			comment: null,
			version: newVersion,
			timestamp
		}).run();
	});
}

export async function submitDocument(actorId: number, docId: string, expectedVersion: number) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: Only the owner (author) can submit
		if (document.authorId !== actor.id) {
			throw new WorkflowError('FORBIDDEN', 'You do not own this document.');
		}

		// Rule: State machine transition check (draft/rejected -> submitted)
		if (document.status !== 'draft' && document.status !== 'rejected') {
			throw new WorkflowError(
				'FORBIDDEN',
				`Cannot submit a document with status ${document.status}.`
			);
		}

		// Rule: Empty documents cannot be submitted
		if (!document.title.trim() || !document.body.trim()) {
			throw new WorkflowError('BAD_REQUEST', 'Empty documents cannot be submitted.');
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document status
		tx.update(documents)
			.set({
				status: 'submitted',
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'submit',
			fromStatus: document.status,
			toStatus: 'submitted',
			comment: null,
			version: newVersion,
			timestamp
		}).run();
	});
}

export async function approveDocument(actorId: number, docId: string, expectedVersion: number) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		// Rule: Only reviewers can approve
		if (actor.role !== 'reviewer') {
			throw new WorkflowError('FORBIDDEN', 'Only reviewers can approve documents.');
		}

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: Authors cannot approve their own documents
		if (document.authorId === actor.id) {
			throw new WorkflowError('FORBIDDEN', 'Authors cannot approve their own documents.');
		}

		// Rule: State machine transition check (submitted -> approved)
		if (document.status !== 'submitted') {
			throw new WorkflowError(
				'FORBIDDEN',
				`Cannot approve a document with status ${document.status}.`
			);
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document status
		tx.update(documents)
			.set({
				status: 'approved',
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'approve',
			fromStatus: 'submitted',
			toStatus: 'approved',
			comment: null,
			version: newVersion,
			timestamp
		}).run();
	});
}

export async function rejectDocument(
	actorId: number,
	docId: string,
	comment: string,
	expectedVersion: number
) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		// Rule: Only reviewers can reject
		if (actor.role !== 'reviewer') {
			throw new WorkflowError('FORBIDDEN', 'Only reviewers can reject documents.');
		}

		// Rule: Rejection requires a comment
		if (!comment || !comment.trim()) {
			throw new WorkflowError('BAD_REQUEST', 'Rejection requires a comment.');
		}

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: Authors cannot reject their own documents
		if (document.authorId === actor.id) {
			throw new WorkflowError('FORBIDDEN', 'Authors cannot reject their own documents.');
		}

		// Rule: State machine transition check (submitted -> rejected)
		if (document.status !== 'submitted') {
			throw new WorkflowError(
				'FORBIDDEN',
				`Cannot reject a document with status ${document.status}.`
			);
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document status
		tx.update(documents)
			.set({
				status: 'rejected',
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'reject',
			fromStatus: 'submitted',
			toStatus: 'rejected',
			comment: comment.trim(),
			version: newVersion,
			timestamp
		}).run();
	});
}

export async function publishDocument(actorId: number, docId: string, expectedVersion: number) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		// Rule: Only reviewer or admin can publish
		if (actor.role !== 'reviewer' && actor.role !== 'admin') {
			throw new WorkflowError('FORBIDDEN', 'Only reviewers or admins can publish documents.');
		}

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: State machine transition check (approved -> published)
		if (document.status !== 'approved') {
			throw new WorkflowError(
				'FORBIDDEN',
				`Cannot publish a document with status ${document.status}.`
			);
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document status
		tx.update(documents)
			.set({
				status: 'published',
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'publish',
			fromStatus: 'approved',
			toStatus: 'published',
			comment: null,
			version: newVersion,
			timestamp
		}).run();
	});
}

export async function archiveDocument(actorId: number, docId: string, expectedVersion: number) {
	return db.transaction((tx) => {
		const actor = getActor(tx, actorId);

		// Rule: Only admins can archive
		if (actor.role !== 'admin') {
			throw new WorkflowError('FORBIDDEN', 'Only admins can archive documents.');
		}

		const doc = tx.select().from(documents).where(eq(documents.id, docId)).all();
		if (doc.length === 0) {
			throw new WorkflowError('NOT_FOUND', 'Document not found.');
		}
		const document = doc[0];

		if (document.version !== expectedVersion) {
			throw new WorkflowError(
				'VERSION_CONFLICT',
				'This document has been modified by another process. Please refresh and try again.'
			);
		}

		// Rule: Cannot archive if already archived
		if (document.status === 'archived') {
			throw new WorkflowError('BAD_REQUEST', 'Document is already archived.');
		}

		const newVersion = document.version + 1;
		const timestamp = Date.now();

		// Update document status
		tx.update(documents)
			.set({
				status: 'archived',
				version: newVersion,
				updatedAt: timestamp
			})
			.where(eq(documents.id, docId))
			.run();

		// Insert audit log
		tx.insert(auditLogs).values({
			id: crypto.randomUUID(),
			documentId: docId,
			actorId: actor.id,
			action: 'archive',
			fromStatus: document.status,
			toStatus: 'archived',
			comment: null,
			version: newVersion,
			timestamp
		}).run();
	});
}
