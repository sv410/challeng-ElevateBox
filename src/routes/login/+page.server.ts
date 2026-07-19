import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim();

		if (!email) {
			return fail(400, { error: 'Email is required.' });
		}

		const validEmails = [
			'alice@example.com',
			'bob@example.com',
			'admin@example.com',
			'viewer@example.com'
		];

		if (!validEmails.includes(email)) {
			return fail(400, { error: 'Invalid seeded email. Please select a valid seeded user.' });
		}

		cookies.set('session_email', email, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: false, // Localhost development
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});

		throw redirect(303, '/');
	}
};
