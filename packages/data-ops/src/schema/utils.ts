import { text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Helper for CUID text primary keys
export const cuidText = () => text('id').$defaultFn(() => createId());

// Helper for created_at timestamp
export const now = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('now') * 1000)`);

// Helper for updated_at timestamp
export const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('now') * 1000)`).$onUpdate(() => new Date());

// Alternative for columns with custom names
export const updatedAtColumn = (name: string) => integer(name, { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('now') * 1000)`).$onUpdate(() => new Date());
