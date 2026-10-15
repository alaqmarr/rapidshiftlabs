CREATE TABLE `raw_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`event_type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`payload` text
);
