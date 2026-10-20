CREATE TABLE `drill_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`status` text NOT NULL,
	`plan_json` text,
	`error` text,
	`cost_usd` real,
	`duration_ms` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `drill_plans_player_season` ON `drill_plans` (`player_id`,`season_id`,`id`);