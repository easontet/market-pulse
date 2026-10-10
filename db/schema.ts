import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const rssSnapshots = sqliteTable('rss_snapshots', {
  key: text('key').primaryKey(),
  source: text('source').notNull(),
  xml: text('xml').notNull(),
  firstAt: integer('first_at').notNull(),
  lastAt: integer('last_at').notNull(),
}, table => [index('rss_source_time').on(table.source, table.lastAt)]);
