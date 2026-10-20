CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`all_top` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_sent_at` integer,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_endpoint_unique` ON `push_devices` (`endpoint`);--> statement-breakpoint
CREATE TABLE `push_follows` (
	`device_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` integer NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`device_id`, `kind`, `ref_id`),
	FOREIGN KEY (`device_id`) REFERENCES `push_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_follows_ref` ON `push_follows` (`kind`,`ref_id`);--> statement-breakpoint
CREATE TABLE `push_sent` (
	`match_id` integer PRIMARY KEY NOT NULL,
	`sent_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
