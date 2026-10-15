CREATE TABLE `server_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`cpu_percent` integer NOT NULL,
	`memory_used_mb` integer NOT NULL,
	`timestamp` integer NOT NULL
);
