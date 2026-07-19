<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	const seededUsers = [
		{ name: 'Alice', email: 'alice@example.com', role: 'Author', desc: 'Create and edit draft documents' },
		{ name: 'Bob', email: 'bob@example.com', role: 'Reviewer', desc: 'Approve or reject submitted documents' },
		{ name: 'Admin', email: 'admin@example.com', role: 'Admin', desc: 'Archive and manage all documents' },
		{ name: 'Viewer', email: 'viewer@example.com', role: 'Viewer', desc: 'View published documents only' }
	];

	let selectedEmail = $state('alice@example.com');
</script>

<svelte:head>
	<title>Log In - ElevateBox Controlled Document Approval System</title>
</svelte:head>

<div class="login-wrapper">
	<div class="login-card">
		<div class="brand">
			<div class="logo-circle">E</div>
			<h1>elevatebox</h1>
			<p class="subtitle">Controlled Document Approval System</p>
		</div>

		{#if form?.error}
			<div class="alert alert-danger">
				<span>{form.error}</span>
			</div>
		{/if}

		<form method="POST" use:enhance>
			<input type="hidden" name="email" value={selectedEmail} />

			<div class="users-grid">
				{#each seededUsers as user}
					<button
						type="button"
						class="user-card"
						class:active={selectedEmail === user.email}
						onclick={() => selectedEmail = user.email}
					>
						<div class="user-header">
							<span class="user-name">{user.name}</span>
							<span class="role-badge badge-{user.role.toLowerCase()}">{user.role}</span>
						</div>
						<span class="user-email">{user.email}</span>
						<p class="user-desc">{user.desc}</p>
					</button>
				{/each}
			</div>

			<button type="submit" class="btn btn-primary submit-btn">
				Sign In as {seededUsers.find(u => u.email === selectedEmail)?.name}
			</button>
		</form>
	</div>
</div>

<style>
	.login-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: radial-gradient(circle at center, rgba(139, 92, 246, 0.07), transparent 60%), #0a0a0f;
		padding: 2rem;
	}

	.login-card {
		background: #11111a;
		border: 1px solid #2d2d3f;
		border-radius: 20px;
		padding: 3rem 2.5rem;
		width: 100%;
		max-width: 580px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.brand {
		text-align: center;
		margin-bottom: 2.5rem;
	}

	.logo-circle {
		width: 48px;
		height: 48px;
		background: linear-gradient(135deg, #8b5cf6, #06b6d4);
		border-radius: 12px;
		color: #fff;
		font-family: 'Outfit', sans-serif;
		font-weight: 800;
		font-size: 1.8rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 2rem;
		letter-spacing: -0.03em;
		background: linear-gradient(90deg, #fff, #c084fc);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: #9ca3af;
		font-size: 0.95rem;
	}

	.users-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	@media (max-width: 480px) {
		.users-grid {
			grid-template-columns: 1fr;
		}
	}

	.user-card {
		background: #191924;
		border: 1px solid #2d2d3f;
		border-radius: 12px;
		padding: 1.25rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.user-card:hover {
		border-color: #4b5563;
		transform: translateY(-2px);
	}

	.user-card.active {
		border-color: #8b5cf6;
		background: rgba(139, 92, 246, 0.05);
		box-shadow: 0 0 0 1px #8b5cf6;
	}

	.user-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
	}

	.user-name {
		font-weight: 600;
		font-size: 1rem;
		color: #fff;
	}

	.role-badge {
		font-size: 0.65rem;
		padding: 0.15rem 0.5rem;
		border-radius: 9999px;
		font-weight: bold;
		text-transform: uppercase;
	}

	.badge-author { background: rgba(139, 92, 246, 0.15); color: #c084fc; }
	.badge-reviewer { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
	.badge-admin { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	.badge-viewer { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }

	.user-email {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.user-desc {
		font-size: 0.8rem;
		color: #6b7280;
		margin-top: 0.5rem;
		line-height: 1.3;
	}

	.submit-btn {
		width: 100%;
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 600;
		border-radius: 12px;
	}
</style>
