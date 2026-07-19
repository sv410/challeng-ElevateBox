import { db } from './index';
import { users } from './schema';

export async function seed() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length === 0) {
    console.log('Seeding database with default users...');
    await db.insert(users).values([
      { name: 'Alice (Author)', email: 'alice@example.com', role: 'author' },
      { name: 'Bob (Reviewer)', email: 'bob@example.com', role: 'reviewer' },
      { name: 'Admin (Admin)', email: 'admin@example.com', role: 'admin' },
      { name: 'Viewer (Viewer)', email: 'viewer@example.com', role: 'viewer' },
    ]);
    console.log('Database seeding complete.');
  }
}
