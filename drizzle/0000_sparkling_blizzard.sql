CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`source_lang` text NOT NULL,
	`detected_lang` text,
	`target_lang` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`original_key` text NOT NULL,
	`result_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_user_created` ON `documents` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `translations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_lang` text NOT NULL,
	`detected_lang` text,
	`target_lang` text NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`in_history` integer DEFAULT true NOT NULL,
	`saved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `translations_user_created` ON `translations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
