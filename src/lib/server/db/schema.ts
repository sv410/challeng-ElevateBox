import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'viewer' | 'author' | 'reviewer' | 'admin'>().notNull(),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').$type<'draft' | 'submitted' | 'approved' | 'published' | 'rejected' | 'archived'>().notNull().default('draft'),
  authorId: integer('author_id').references(() => users.id).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  documentId: text('document_id').references(() => documents.id).notNull(),
  actorId: integer('actor_id').references(() => users.id).notNull(),
  action: text('action').$type<'create' | 'edit' | 'submit' | 'approve' | 'reject' | 'publish' | 'archive'>().notNull(),
  fromStatus: text('from_status').$type<'draft' | 'submitted' | 'approved' | 'published' | 'rejected' | 'archived'>(),
  toStatus: text('to_status').$type<'draft' | 'submitted' | 'approved' | 'published' | 'rejected' | 'archived'>().notNull(),
  comment: text('comment'),
  version: integer('version').notNull(),
  timestamp: integer('timestamp').notNull(),
});
