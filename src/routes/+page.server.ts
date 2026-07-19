import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { documents, auditLogs, users } from '$lib/server/db/schema';
import { eq, or, and } from 'drizzle-orm';
import {
	createDocument,
	editDocument,
	submitDocument,
	approveDocument,
	rejectDocument,
	publishDocument,
	archiveDocument,
	WorkflowError
} from '$lib/server/workflow';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		throw redirect(302, '/login');
	}

	// 1. Fetch visible documents based on authorization role
	const query = db
		.select({
			id: documents.id,
			title: documents.title,
			body: documents.body,
			status: documents.status,
			authorId: documents.authorId,
			authorName: users.name,
			authorEmail: users.email,
			version: documents.version,
			createdAt: documents.createdAt,
			updatedAt: documents.updatedAt
		})
		.from(documents)
		.leftJoin(users, eq(documents.authorId, users.id));

	let visibleDocs;

	if (user.role === 'admin') {
		// Admin can see everything
		visibleDocs = await query;
	} else if (user.role === 'reviewer') {
		// Reviewer can see: published docs, submitted docs, and their own docs
		visibleDocs = await query.where(
			or(
				eq(documents.status, 'published'),
				eq(documents.status, 'submitted'),
				eq(documents.authorId, user.id)
			)
		);
	} else if (user.role === 'author') {
		// Author can see: published docs, and their own docs
		visibleDocs = await query.where(
			or(
				eq(documents.status, 'published'),
				eq(documents.authorId, user.id)
			)
		);
	} else {
		// Viewer can see: only published docs
		visibleDocs = await query.where(eq(documents.status, 'published'));
	}

	// Sort visible documents by updated timestamp descending
	visibleDocs.sort((a, b) => b.updatedAt - a.updatedAt);

	// 2. Fetch all audit logs for the visible documents
	let logs: any[] = [];
	if (visibleDocs.length > 0) {
		const docIds = visibleDocs.map((d) => d.id);
		// Drizzle in-operator helper. In sqlite, we can just fetch all and filter in memory, or use `inArray`
		const allLogs = await db
			.select({
				id: auditLogs.id,
				documentId: auditLogs.documentId,
				actorId: auditLogs.actorId,
				actorName: users.name,
				actorEmail: users.email,
				action: auditLogs.action,
				fromStatus: auditLogs.fromStatus,
				toStatus: auditLogs.toStatus,
				comment: auditLogs.comment,
				version: auditLogs.version,
				timestamp: auditLogs.timestamp
			})
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.actorId, users.id))
			.orderBy(auditLogs.timestamp);

		// Filter logs for the visible documents
		logs = allLogs.filter((l) => docIds.includes(l.documentId));
	}

	// 3. Fetch seeded users to allow easy testing context switches
	const allUsers = await db.select().from(users);

	return {
		documents: visibleDocs,
		auditLogs: logs,
		allUsers
	};
};

export const actions: Actions = {
	logout: async ({ cookies }) => {
		cookies.delete('session_email', { path: '/' });
		throw redirect(303, '/login');
	},

	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const title = data.get('title')?.toString() || '';
		const body = data.get('body')?.toString() || '';

		try {
			await createDocument(locals.user.id, title, body);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to create document.' });
		}
	},

	edit: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const title = data.get('title')?.toString() || '';
		const body = data.get('body')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await editDocument(locals.user.id, id, title, body, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to edit document.' });
		}
	},

	submit: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await submitDocument(locals.user.id, id, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to submit document.' });
		}
	},

	approve: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await approveDocument(locals.user.id, id, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to approve document.' });
		}
	},

	reject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const comment = data.get('comment')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await rejectDocument(locals.user.id, id, comment, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to reject document.' });
		}
	},

	publish: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await publishDocument(locals.user.id, id, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to publish document.' });
		}
	},

	archive: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = data.get('id')?.toString() || '';
		const version = parseInt(data.get('version')?.toString() || '0');

		try {
			await archiveDocument(locals.user.id, id, version);
			return { success: true };
		} catch (err) {
			if (err instanceof WorkflowError) {
				return fail(err.code === 'VERSION_CONFLICT' ? 409 : 400, {
					error: err.message,
					errorCode: err.code,
					docId: id
				});
			}
			console.error(err);
			return fail(500, { error: 'Failed to archive document.' });
		}
	}
};
