import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './db';
import { users, documents, auditLogs } from './db/schema';
import { eq } from 'drizzle-orm';
import {
	createDocument,
	editDocument,
	submitDocument,
	approveDocument,
	rejectDocument,
	publishDocument,
	archiveDocument,
	WorkflowError
} from './workflow';

describe('Controlled Document Approval Workflow Engine', () => {
	let authorId: number;
	let reviewerId: number;
	let adminId: number;
	let viewerId: number;

	beforeAll(async () => {
		// Populate test environment if empty
		const existingUsers = await db.select().from(users);
		if (existingUsers.length === 0) {
			await db.insert(users).values([
				{ name: 'Alice', email: 'alice@example.com', role: 'author' },
				{ name: 'Bob', email: 'bob@example.com', role: 'reviewer' },
				{ name: 'Admin', email: 'admin@example.com', role: 'admin' },
				{ name: 'Viewer', email: 'viewer@example.com', role: 'viewer' }
			]);
		}

		const alice = await db.select().from(users).where(eq(users.email, 'alice@example.com')).limit(1);
		const bob = await db.select().from(users).where(eq(users.email, 'bob@example.com')).limit(1);
		const admin = await db.select().from(users).where(eq(users.email, 'admin@example.com')).limit(1);
		const viewer = await db.select().from(users).where(eq(users.email, 'viewer@example.com')).limit(1);

		authorId = alice[0].id;
		reviewerId = bob[0].id;
		adminId = admin[0].id;
		viewerId = viewer[0].id;
	});

	it('Rule: Author can create a draft document', async () => {
		const docId = await createDocument(authorId, 'Test Document', 'Initial body text');
		expect(docId).toBeDefined();

		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc.length).toBe(1);
		expect(doc[0].status).toBe('draft');
		expect(doc[0].version).toBe(1);

		// Assert audit log creation
		const logs = await db.select().from(auditLogs).where(eq(auditLogs.documentId, docId));
		expect(logs.length).toBe(1);
		expect(logs[0].action).toBe('create');
		expect(logs[0].toStatus).toBe('draft');
		expect(logs[0].actorId).toBe(authorId);
	});

	it('Rule: Viewers cannot create documents', async () => {
		await expect(
			createDocument(viewerId, 'Viewer Title', 'Viewer Body')
		).rejects.toThrowError('Only authors can create documents.');
	});

	it('Rule: Empty title or body is rejected', async () => {
		await expect(createDocument(authorId, '   ', 'Body')).rejects.toThrowError(
			'Title and body cannot be empty.'
		);
		await expect(createDocument(authorId, 'Title', '')).rejects.toThrowError(
			'Title and body cannot be empty.'
		);
	});

	it('Rule: Author can edit their own draft document', async () => {
		const docId = await createDocument(authorId, 'Edit Test', 'Original');
		await editDocument(authorId, docId, 'Edit Test Updated', 'Updated body', 1);

		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc[0].title).toBe('Edit Test Updated');
		expect(doc[0].body).toBe('Updated body');
		expect(doc[0].version).toBe(2);

		const logs = await db.select().from(auditLogs).where(eq(auditLogs.documentId, docId));
		expect(logs.length).toBe(2); // create and edit
		expect(logs[1].action).toBe('edit');
		expect(logs[1].version).toBe(2);
	});

	it('Rule: Author cannot edit drafts owned by another user', async () => {
		const docId = await createDocument(authorId, 'Someone elses draft', 'Secret');
		// Try editing as another user (pretend reviewer is also trying to edit)
		await expect(
			editDocument(reviewerId, docId, 'Hacked', 'Hacked', 1)
		).rejects.toThrowError('You do not own this document.');
	});

	it('Rule: Stale updates are blocked by concurrency check', async () => {
		const docId = await createDocument(authorId, 'Concurrency Test', 'Original');
		
		// Alice updates the document once, changing version to 2
		await editDocument(authorId, docId, 'First update', 'Original', 1);

		// Alice tries to update again using expectedVersion 1 (stale client state)
		await expect(
			editDocument(authorId, docId, 'Stale update attempt', 'Original', 1)
		).rejects.toThrowError('This document has been modified by another process. Please refresh and try again.');
	});

	it('Rule: State machine submit transition (draft -> submitted)', async () => {
		const docId = await createDocument(authorId, 'Submission Test', 'Draft body');
		await submitDocument(authorId, docId, 1);

		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc[0].status).toBe('submitted');
		expect(doc[0].version).toBe(2);

		// Cannot edit while submitted
		await expect(
			editDocument(authorId, docId, 'Title change', 'Body change', 2)
		).rejects.toThrowError('Cannot edit a document in submitted status.');
	});

	it('Rule: Only reviewers can approve submitted documents', async () => {
		const docId = await createDocument(authorId, 'Approval Test', 'Draft body');
		await submitDocument(authorId, docId, 1);

		// Try to approve as admin (blocked, must be reviewer)
		await expect(approveDocument(adminId, docId, 2)).rejects.toThrowError(
			'Only reviewers can approve documents.'
		);
	});

	it('Rule: Reviewers cannot approve their own documents', async () => {
		// Mock reviewer as the creator (even though seeded Bob is only reviewer,
		// let's test safety logic for a user who is author AND reviewer)
		// We'll create a new user who is author & reviewer
		const uniqueEmail = `mixed-${crypto.randomUUID()}@example.com`;
		const mixedUserList = await db
			.insert(users)
			.values({
				name: 'Mixed User',
				email: uniqueEmail,
				role: 'reviewer' // possesses reviewer role
			})
			.returning();
		const mixedUserId = mixedUserList[0].id;

		// mixed user creates draft (role check bypass if we force, but since mixedUserId role is reviewer,
		// let's temporarily set their role to author to create)
		await db.update(users).set({ role: 'author' }).where(eq(users.id, mixedUserId));
		const docId = await createDocument(mixedUserId, 'Self Review Test', 'Draft');
		await submitDocument(mixedUserId, docId, 1);

		// Switch role to reviewer
		await db.update(users).set({ role: 'reviewer' }).where(eq(users.id, mixedUserId));

		// Mixed user tries to approve their own document
		await expect(approveDocument(mixedUserId, docId, 2)).rejects.toThrowError(
			'Authors cannot approve their own documents.'
		);
	});

	it('Rule: Rejection requires a comment', async () => {
		const docId = await createDocument(authorId, 'Rejection Test', 'Draft body');
		await submitDocument(authorId, docId, 1);

		await expect(rejectDocument(reviewerId, docId, '   ', 2)).rejects.toThrowError(
			'Rejection requires a comment.'
		);

		await rejectDocument(reviewerId, docId, 'Spelling errors', 2);
		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc[0].status).toBe('rejected');
		expect(doc[0].version).toBe(3);

		// Rejected returns to editable state for the author
		await editDocument(authorId, docId, 'Fixed Rejection', 'Fixed content', 3);
		const docUpdated = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(docUpdated[0].status).toBe('rejected'); // remains rejected but content changes
	});

	it('Rule: Approved documents can be published by reviewer/admin', async () => {
		const docId = await createDocument(authorId, 'Publish Test', 'Draft body');
		await submitDocument(authorId, docId, 1);
		await approveDocument(reviewerId, docId, 2);

		// Viewer cannot publish
		await expect(publishDocument(viewerId, docId, 3)).rejects.toThrowError(
			'Only reviewers or admins can publish documents.'
		);

		// Reviewer can publish
		await publishDocument(reviewerId, docId, 3);
		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc[0].status).toBe('published');
		expect(doc[0].version).toBe(4);
	});

	it('Rule: Admins can archive documents, preventing further edits/publications', async () => {
		const docId = await createDocument(authorId, 'Archive Test', 'Draft body');
		
		// Viewer cannot archive
		await expect(archiveDocument(viewerId, docId, 1)).rejects.toThrowError(
			'Only admins can archive documents.'
		);

		// Admin can archive from draft
		await archiveDocument(adminId, docId, 1);
		const doc = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
		expect(doc[0].status).toBe('archived');
		expect(doc[0].version).toBe(2);

		// Try to submit archived (blocked)
		await expect(submitDocument(authorId, docId, 2)).rejects.toThrowError(
			'Cannot submit a document with status archived.'
		);
	});
});
