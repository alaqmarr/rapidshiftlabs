CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`title` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_client_contacts_client` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_client_contacts_email` ON `client_contacts` (`email`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`gstin` text,
	`pan` text,
	`billing_mode` text DEFAULT 'non_gst' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`country` text DEFAULT 'India' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_slug_unique` ON `clients` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_clients_slug` ON `clients` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_clients_status` ON `clients` (`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_client` ON `projects` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_slug` ON `projects` (`client_id`,`slug`);--> statement-breakpoint
CREATE TABLE `contract_items` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contract_items_contract` ON `contract_items` (`contract_id`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`anchor_day` integer DEFAULT 1 NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_to` integer NOT NULL,
	`auto_renew` integer DEFAULT false NOT NULL,
	`grace_days` integer DEFAULT 7 NOT NULL,
	`payment_terms_days` integer DEFAULT 15 NOT NULL,
	`tax_profile` text DEFAULT 'non_gst' NOT NULL,
	`gst_rate_bps` integer DEFAULT 1800 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_code_unique` ON `contracts` (`code`);--> statement-breakpoint
CREATE INDEX `idx_contracts_client` ON `contracts` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_contracts_status` ON `contracts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_contracts_code` ON `contracts` (`code`);--> statement-breakpoint
CREATE TABLE `billing_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`client_id` text NOT NULL,
	`period_number` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`due_date` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invoice_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_billing_periods_contract` ON `billing_periods` (`contract_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_periods_client` ON `billing_periods` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_periods_status` ON `billing_periods` (`status`);--> statement-breakpoint
CREATE INDEX `idx_billing_periods_due` ON `billing_periods` (`due_date`);--> statement-breakpoint
CREATE TABLE `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_note_number` text NOT NULL,
	`invoice_id` text NOT NULL,
	`client_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_notes_credit_note_number_unique` ON `credit_notes` (`credit_note_number`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_invoice` ON `credit_notes` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_client` ON `credit_notes` (`client_id`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`sac_code` text DEFAULT '998311' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_invoice` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`billing_mode` text DEFAULT 'non_gst' NOT NULL,
	`client_id` text NOT NULL,
	`contract_id` text,
	`billing_period_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` integer NOT NULL,
	`due_date` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`cgst_rate_bps` integer DEFAULT 0 NOT NULL,
	`cgst_minor` integer DEFAULT 0 NOT NULL,
	`sgst_rate_bps` integer DEFAULT 0 NOT NULL,
	`sgst_minor` integer DEFAULT 0 NOT NULL,
	`igst_rate_bps` integer DEFAULT 0 NOT NULL,
	`igst_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`balance_minor` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`pdf_path` text,
	`issued_at` integer,
	`voided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_client` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_contract` ON `invoices` (`contract_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_due` ON `invoices` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_invoices_number` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`client_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`payment_date` integer NOT NULL,
	`method` text DEFAULT 'upi' NOT NULL,
	`reference` text,
	`notes` text,
	`recorded_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payments_invoice` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_client` ON `payments` (`client_id`);