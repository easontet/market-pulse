CREATE TABLE `rss_snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`xml` text NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rss_source_time` ON `rss_snapshots` (`source`,`last_at`);