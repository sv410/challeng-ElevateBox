import { redirect, type Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { seed } from '$lib/server/db/seed';

// Seed database on startup (runs once when module is loaded)
seed().catch((err) => {
	console.error('Failed to seed database:', err);
});

export const handle: Handle = async ({ event, resolve }) => {
	const email = event.cookies.get('session_email');

	event.locals.user = null;

	if (email) {
		const userList = await db.select().from(users).where(eq(users.email, email)).limit(1);
		if (userList.length > 0) {
			event.locals.user = {
				id: userList[0].id,
				email: userList[0].email,
				name: userList[0].name,
				role: userList[0].role
			};
		}
	}

	// Protect all private pages except /login
	if (!event.url.pathname.startsWith('/login') && !event.locals.user) {
		throw redirect(302, '/login');
	}

	const response = await resolve(event);
	return response;
};
