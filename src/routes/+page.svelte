<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	// Active tab filters
	let activeTab = $state('all'); // 'all' | 'drafts' | 'queue' | 'published' | 'archived'

	// Selected document ID
	let selectedDocId = $state<string | null>(null);

	// Modals & UI states
	let isCreating = $state(false);
	let isEditing = $state(false);
	let showRejectModal = $state(false);
	let rejectComment = $state('');

	// Edit document form state
	let editTitle = $state('');
	let editBody = $state('');

	// Retrieve user and documents from loaders
	const user = $derived(data.user);
	const documents = $derived(data.documents);
	const auditLogs = $derived(data.auditLogs);
	const allUsers = $derived(data.allUsers);

	// Filter documents based on active tab and role
	const filteredDocs = $derived.by(() => {
		if (activeTab === 'drafts') {
			return documents.filter(d => d.status === 'draft' || d.status === 'rejected');
		} else if (activeTab === 'queue') {
			return documents.filter(d => d.status === 'submitted');
		} else if (activeTab === 'published') {
			return documents.filter(d => d.status === 'published');
		} else if (activeTab === 'archived') {
			return documents.filter(d => d.status === 'archived');
		}
		return documents;
	});

	// Get currently selected document
	const selectedDoc = $derived(
		documents.find(d => d.id === selectedDocId) || filteredDocs[0] || null
	);

	// Keep track of when a document is selected to populate edit form
	$effect(() => {
		if (selectedDoc) {
			selectedDocId = selectedDoc.id;
			editTitle = selectedDoc.title;
			editBody = selectedDoc.body;
		} else {
			selectedDocId = null;
			isEditing = false;
		}
	});

	// Get audit logs for the selected document
	const selectedDocLogs = $derived(
		selectedDoc ? auditLogs.filter(log => log.documentId === selectedDoc.id) : []
	);

	// Check if active user is owner of the selected document
	const isOwner = $derived(
		user && selectedDoc && selectedDoc.authorId === user.id
	);
</script>

<svelte:head>
	<title>Dashboard - ElevateBox Document Approval</title>
</svelte:head>

<!-- Fast Switcher Bar -->
<div class="test-switcher-bar">
	<span class="switcher-label">TESTING CONTEXT SWITCHER:</span>
	<div class="switcher-buttons">
		{#each allUsers as u}
			<form action="/login" method="POST" use:enhance>
				<input type="hidden" name="email" value={u.email} />
				<button
					type="submit"
					class="switcher-btn"
					class:active={user?.email === u.email}
				>
					{u.name} <span class="sub-role">({u.role})</span>
				</button>
			</form>
		{/each}
	</div>
</div>

<div class="dashboard-wrapper">
	<!-- Display Form Failure States -->
	{#if form?.error}
		<div class="alert alert-danger floating-alert">
			<div class="alert-icon">⚠️</div>
			<div class="alert-body">
				<strong>Action Failed</strong>
				<p>{form.error}</p>
				{#if form.errorCode === 'VERSION_CONFLICT'}
					<button onclick={() => window.location.reload()} class="btn btn-secondary btn-sm" style="margin-top: 0.5rem; padding: 0.25rem 0.5rem; font-size: 0.75rem;">
						Sync & Refresh Page
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="grid-layout">
		<!-- LEFT SIDEBAR: Document List -->
		<aside class="sidebar">
			<div class="sidebar-header">
				<h2>Documents</h2>
				{#if user?.role === 'author'}
					<button class="btn btn-primary btn-sm" onclick={() => isCreating = true}>
						+ New Draft
					</button>
				{/if}
			</div>

			<!-- Filter Tabs -->
			<div class="tab-filters">
				<button class="tab-btn" class:active={activeTab === 'all'} onclick={() => activeTab = 'all'}>All</button>
				{#if user?.role === 'author'}
					<button class="tab-btn" class:active={activeTab === 'drafts'} onclick={() => activeTab = 'drafts'}>My Drafts</button>
				{/if}
				{#if user?.role === 'reviewer' || user?.role === 'admin'}
					<button class="tab-btn" class:active={activeTab === 'queue'} onclick={() => activeTab = 'queue'}>Review Queue</button>
				{/if}
				<button class="tab-btn" class:active={activeTab === 'published'} onclick={() => activeTab = 'published'}>Published</button>
				{#if user?.role === 'admin'}
					<button class="tab-btn" class:active={activeTab === 'archived'} onclick={() => activeTab = 'archived'}>Archived</button>
				{/if}
			</div>

			<!-- List View -->
			<div class="doc-list">
				{#if filteredDocs.length === 0}
					<div class="empty-state">No documents found.</div>
				{:else}
					{#each filteredDocs as doc}
						<button
							class="doc-item-card"
							class:selected={selectedDocId === doc.id}
							onclick={() => { selectedDocId = doc.id; isEditing = false; }}
						>
							<div class="doc-item-meta">
								<span class="badge badge-{doc.status}">{doc.status}</span>
								<span class="version-label">v{doc.version}</span>
							</div>
							<h3>{doc.title}</h3>
							<p class="doc-snippet">{doc.body.substring(0, 70)}{doc.body.length > 70 ? '...' : ''}</p>
							<div class="author-attribution">By {doc.authorName}</div>
						</button>
					{/each}
				{/if}
			</div>
		</aside>

		<!-- RIGHT PANE: Document Detail and Audit Timeline -->
		<section class="detail-pane">
			{#if !selectedDoc}
				<div class="detail-empty">
					<div class="empty-icon">📂</div>
					<h3>No Document Selected</h3>
					<p>Select a document from the left list to view its contents and audit history.</p>
				</div>
			{:else}
				<div class="doc-detail-card">
					{#if isEditing}
						<!-- Editing Mode Form -->
						<form method="POST" action="?/edit" use:enhance={() => {
							return async ({ update, result }) => {
								await update();
								if (result.type === 'success') {
									isEditing = false;
								}
							};
						}}>
							<input type="hidden" name="id" value={selectedDoc.id} />
							<input type="hidden" name="version" value={selectedDoc.version} />
							
							<div class="form-group">
								<label for="edit-title">Title</label>
								<input
									id="edit-title"
									name="title"
									type="text"
									class="form-control"
									bind:value={editTitle}
								/>
							</div>

							<div class="form-group">
								<label for="edit-body">Content</label>
								<textarea
									id="edit-body"
									name="body"
									class="form-control"
									bind:value={editBody}
								></textarea>
							</div>

							<div class="form-actions">
								<button type="submit" class="btn btn-primary">Save Changes</button>
								<button type="button" class="btn btn-secondary" onclick={() => isEditing = false}>Cancel</button>
							</div>
						</form>
					{:else}
						<!-- Standard Read Mode -->
						<div class="doc-header">
							<div class="doc-header-top">
								<span class="badge badge-{selectedDoc.status} badge-lg">{selectedDoc.status}</span>
								<div class="meta-stats">
									<span class="doc-ver">Version {selectedDoc.version}</span>
									<span class="doc-author">Author: <strong>{selectedDoc.authorName}</strong></span>
								</div>
							</div>
							<h1>{selectedDoc.title}</h1>
						</div>

						<div class="doc-body">
							{selectedDoc.body}
						</div>

						<!-- State Machine Action Bar -->
						<div class="workflow-actions">
							<!-- Author Actions -->
							{#if user?.role === 'author' && isOwner}
								{#if selectedDoc.status === 'draft' || selectedDoc.status === 'rejected'}
									<button class="btn btn-secondary" onclick={() => {
										editTitle = selectedDoc.title;
										editBody = selectedDoc.body;
										isEditing = true;
									}}>
										Edit Draft
									</button>

									<form method="POST" action="?/submit" use:enhance>
										<input type="hidden" name="id" value={selectedDoc.id} />
										<input type="hidden" name="version" value={selectedDoc.version} />
										<button type="submit" class="btn btn-primary">Submit for Review</button>
									</form>
								{/if}
							{/if}

							<!-- Reviewer Actions -->
							{#if user?.role === 'reviewer'}
								{#if selectedDoc.status === 'submitted'}
									{#if selectedDoc.authorId === user.id}
										<div class="rule-warning">
											⚠️ As the Author of this document, you are blocked from reviewing it.
										</div>
									{:else}
										<form method="POST" action="?/approve" use:enhance>
											<input type="hidden" name="id" value={selectedDoc.id} />
											<input type="hidden" name="version" value={selectedDoc.version} />
											<button type="submit" class="btn btn-success">Approve Document</button>
										</form>

										<button class="btn btn-danger" onclick={() => {
											rejectComment = '';
											showRejectModal = true;
										}}>
											Reject Document
										</button>
									{/if}
								{/if}

								{#if selectedDoc.status === 'approved'}
									<form method="POST" action="?/publish" use:enhance>
										<input type="hidden" name="id" value={selectedDoc.id} />
										<input type="hidden" name="version" value={selectedDoc.version} />
										<button type="submit" class="btn btn-primary">Publish to Public</button>
									</form>
								{/if}
							{/if}

							<!-- Admin Actions -->
							{#if user?.role === 'admin'}
								{#if selectedDoc.status === 'approved'}
									<form method="POST" action="?/publish" use:enhance>
										<input type="hidden" name="id" value={selectedDoc.id} />
										<input type="hidden" name="version" value={selectedDoc.version} />
										<button type="submit" class="btn btn-primary">Publish to Public</button>
									</form>
								{/if}

								{#if selectedDoc.status !== 'archived'}
									<form method="POST" action="?/archive" use:enhance>
										<input type="hidden" name="id" value={selectedDoc.id} />
										<input type="hidden" name="version" value={selectedDoc.version} />
										<button type="submit" class="btn btn-danger">Archive Document</button>
									</form>
								{/if}
							{/if}
						</div>
					{/if}
				</div>

				<!-- Timeline Audit Log -->
				<div class="audit-timeline-container">
					<h3>Audit Trail & History</h3>
					<div class="timeline">
						{#each selectedDocLogs as log}
							<div class="timeline-item">
								<div class="timeline-dot dot-{log.action}"></div>
								<div class="timeline-content">
									<div class="timeline-header">
										<span class="actor"><strong>{log.actorName}</strong> ({log.actorEmail})</span>
										<span class="timestamp">{new Date(log.timestamp).toLocaleString()}</span>
									</div>
									<div class="timeline-action">
										Action: <span class="action-badge action-{log.action}">{log.action}</span>
										{#if log.fromStatus}
											from <span class="badge badge-{log.fromStatus}">{log.fromStatus}</span>
										{/if}
										to <span class="badge badge-{log.toStatus}">{log.toStatus}</span>
										<span class="timeline-ver">Document v{log.version}</span>
									</div>
									{#if log.comment}
										<div class="timeline-comment">
											<strong>Comment:</strong> "{log.comment}"
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>

<!-- Modal: Create Document -->
{#if isCreating}
	<div class="modal-overlay">
		<div class="modal-content">
			<h2>Create Draft Document</h2>
			<form method="POST" action="?/create" use:enhance={() => {
				return async ({ update, result }) => {
					await update();
					if (result.type === 'success') {
						isCreating = false;
					}
				};
			}}>
				<div class="form-group">
					<label for="create-title">Title</label>
					<input
						id="create-title"
						name="title"
						type="text"
						class="form-control"
						placeholder="E.g., Engineering Architecture Guidelines"
						required
					/>
				</div>

				<div class="form-group">
					<label for="create-body">Content</label>
					<textarea
						id="create-body"
						name="body"
						class="form-control"
						placeholder="Write the document content here..."
						required
					></textarea>
				</div>

				<div class="form-actions">
					<button type="submit" class="btn btn-primary">Create Draft</button>
					<button type="button" class="btn btn-secondary" onclick={() => isCreating = false}>Cancel</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal: Reject Comment -->
{#if showRejectModal && selectedDoc}
	<div class="modal-overlay">
		<div class="modal-content">
			<h2>Reject Document</h2>
			<p class="modal-subtext">Please provide a reason/comment for the rejection. Rejection comments are recorded in the audit trail.</p>
			
			<form method="POST" action="?/reject" use:enhance={() => {
				return async ({ update, result }) => {
					await update();
					if (result.type === 'success') {
						showRejectModal = false;
						rejectComment = '';
					}
				};
			}}>
				<input type="hidden" name="id" value={selectedDoc.id} />
				<input type="hidden" name="version" value={selectedDoc.version} />

				<div class="form-group">
					<label for="reject-comment">Rejection Comment</label>
					<textarea
						id="reject-comment"
						name="comment"
						class="form-control"
						bind:value={rejectComment}
						placeholder="Provide clear reasons for rejecting this draft..."
						required
					></textarea>
				</div>

				<div class="form-actions">
					<button type="submit" class="btn btn-danger" disabled={!rejectComment.trim()}>
						Confirm Rejection
					</button>
					<button type="button" class="btn btn-secondary" onclick={() => showRejectModal = false}>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Switcher Bar */
	.test-switcher-bar {
		background: #11111a;
		border-bottom: 1px solid #2d2d3f;
		padding: 0.6rem 2rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.switcher-label {
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 800;
		color: var(--accent-cyan);
		letter-spacing: 0.05em;
	}

	.switcher-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.switcher-btn {
		background: #191924;
		border: 1px solid #2d2d3f;
		color: var(--text-secondary);
		padding: 0.35rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: var(--transition-smooth);
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.switcher-btn:hover {
		border-color: #4b5563;
		color: #fff;
	}

	.switcher-btn.active {
		border-color: var(--accent-purple);
		background: rgba(139, 92, 246, 0.1);
		color: #fff;
	}

	.sub-role {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	/* Main Layout Grid */
	.dashboard-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 2rem;
		position: relative;
	}

	.grid-layout {
		flex: 1;
		display: grid;
		grid-template-columns: 360px 1fr;
		gap: 2rem;
	}

	@media (max-width: 960px) {
		.grid-layout {
			grid-template-columns: 1fr;
		}
	}

	/* Sidebar styling */
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		height: calc(100vh - 180px);
		position: sticky;
		top: 100px;
	}

	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sidebar-header h2 {
		font-size: 1.35rem;
		color: #fff;
	}

	.tab-filters {
		display: flex;
		background: var(--bg-darker);
		padding: 0.25rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-light);
	}

	.tab-btn {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		padding: 0.5rem 0.25rem;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: var(--transition-smooth);
		text-align: center;
	}

	.tab-btn:hover {
		color: #fff;
	}

	.tab-btn.active {
		background: var(--bg-dark);
		color: #fff;
		border: 1px solid var(--border-light);
	}

	.doc-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-right: 0.25rem;
	}

	.doc-list::-webkit-scrollbar {
		width: 4px;
	}
	.doc-list::-webkit-scrollbar-thumb {
		background: var(--border-light);
		border-radius: 9999px;
	}

	.empty-state {
		text-align: center;
		color: var(--text-muted);
		padding: 3rem 0;
		font-size: 0.9rem;
	}

	/* Document Cards */
	.doc-item-card {
		background: var(--bg-darker);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		text-align: left;
		cursor: pointer;
		transition: var(--transition-smooth);
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.doc-item-card:hover {
		transform: translateY(-2px);
		border-color: #4b5563;
		box-shadow: 0 4px 20px rgba(0,0,0,0.25);
	}

	.doc-item-card.selected {
		border-color: var(--accent-purple);
		background: rgba(139, 92, 246, 0.03);
	}

	.doc-item-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.version-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.doc-item-card h3 {
		font-size: 1rem;
		color: #fff;
		line-height: 1.3;
	}

	.doc-snippet {
		font-size: 0.825rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.author-attribution {
		font-size: 0.725rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
		align-self: flex-end;
	}

	/* Detail Pane */
	.detail-pane {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		min-height: calc(100vh - 180px);
	}

	.detail-empty {
		flex: 1;
		background: var(--bg-darker);
		border: 1px dashed var(--border-light);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem;
		text-align: center;
		color: var(--text-secondary);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.doc-detail-card {
		background: var(--bg-darker);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: 0 10px 30px rgba(0,0,0,0.15);
	}

	.doc-header {
		border-bottom: 1px solid var(--border-light);
		padding-bottom: 1.5rem;
		margin-bottom: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.doc-header-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.badge-lg {
		padding: 0.35rem 1rem;
		font-size: 0.8rem;
		letter-spacing: 0.05em;
	}

	.meta-stats {
		display: flex;
		gap: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.doc-header h1 {
		font-size: 2.2rem;
		color: #fff;
		line-height: 1.2;
		letter-spacing: -0.02em;
	}

	.doc-body {
		font-size: 1.05rem;
		line-height: 1.6;
		color: var(--text-primary);
		white-space: pre-wrap;
		margin-bottom: 2.5rem;
	}

	.workflow-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		border-top: 1px solid var(--border-light);
		padding-top: 1.5rem;
		align-items: center;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.rule-warning {
		color: #f87171;
		font-size: 0.85rem;
		font-weight: 500;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		width: 100%;
	}

	/* Timeline Audit Log styling */
	.audit-timeline-container {
		background: var(--bg-darker);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
	}

	.audit-timeline-container h3 {
		font-size: 1.2rem;
		color: #fff;
		margin-bottom: 1.5rem;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		position: relative;
	}

	.timeline::before {
		content: '';
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 6px;
		width: 2px;
		background: var(--border-light);
	}

	.timeline-item {
		display: flex;
		gap: 1.25rem;
		position: relative;
		z-index: 1;
	}

	.timeline-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #9ca3af;
		margin-top: 4px;
		border: 3px solid var(--bg-darker);
	}

	/* Action-dependent dots */
	.dot-create { background: #9ca3af; }
	.dot-edit { background: #a78bfa; }
	.dot-submit { background: #fbbf24; }
	.dot-approve { background: #10b981; }
	.dot-reject { background: #ef4444; }
	.dot-publish { background: #06b6d4; }
	.dot-archive { background: #4b5569; }

	.timeline-content {
		flex: 1;
		background: var(--bg-dark);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.timeline-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
	}

	.actor {
		color: #fff;
	}

	.timestamp {
		color: var(--text-muted);
	}

	.timeline-action {
		font-size: 0.85rem;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.action-badge {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(255,255,255,0.08);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.action-create { color: #d1d5db; }
	.action-edit { color: #c084fc; }
	.action-submit { color: #fbbf24; }
	.action-approve { color: #34d399; }
	.action-reject { color: #f87171; }
	.action-publish { color: #22d3ee; }
	.action-archive { color: #9ca3af; }

	.timeline-ver {
		color: var(--text-muted);
		font-size: 0.75rem;
		margin-left: auto;
	}

	.timeline-comment {
		font-size: 0.85rem;
		color: #f87171;
		background: rgba(239, 68, 68, 0.05);
		border-left: 3px solid #ef4444;
		padding: 0.5rem 0.75rem;
		border-radius: 0 4px 4px 0;
		font-style: italic;
	}

	/* Floating Alert styling */
	.floating-alert {
		position: fixed;
		top: 90px;
		right: 2rem;
		z-index: 999;
		max-width: 400px;
		box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
		animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		display: flex;
		gap: 0.75rem;
	}

	.alert-icon {
		font-size: 1.5rem;
		line-height: 1;
	}

	.alert-body strong {
		color: #fff;
		display: block;
		margin-bottom: 0.25rem;
	}

	@keyframes slideInRight {
		from { transform: translateX(100px); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}

	.modal-subtext {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-bottom: 1.25rem;
	}

	.btn-sm {
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
	}
</style>
