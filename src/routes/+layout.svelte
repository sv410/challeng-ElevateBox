<script lang="ts">
	import '../app.css';

	let { data, children } = $props();
</script>

<div class="app-container">
	{#if data.user}
		<header>
			<div class="header-content">
				<div class="logo-group">
					<div class="logo-icon">E</div>
					<span class="logo-text">elevatebox</span>
				</div>
				<div class="auth-panel">
					<div class="user-badge">
						<div class="user-avatar">{data.user.name[0]}</div>
						<div class="user-info">
							<span class="user-name">{data.user.name}</span>
							<span class="user-role">{data.user.role}</span>
						</div>
					</div>
					<form action="/?/logout" method="POST">
						<button type="submit" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
							Log Out
						</button>
					</form>
				</div>
			</div>
		</header>
	{/if}
	<main style="flex: 1; display: flex; flex-direction: column; width: 100%;">
		{@render children()}
	</main>
</div>
