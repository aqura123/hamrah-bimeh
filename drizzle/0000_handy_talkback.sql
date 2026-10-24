CREATE TYPE "public"."request_status" AS ENUM('registered', 'office_reviewing', 'needs_customer_info', 'in_progress', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('driver', 'workshop');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'office_admin');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(20) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"request_id" uuid,
	"event_type" varchar(64) NOT NULL,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"summary_fa" text NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"mobile" varchar(20) NOT NULL,
	"national_id" varchar(10),
	"phone" varchar(30),
	"office_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"national_id" varchar(10) NOT NULL,
	"review_state" varchar(32) DEFAULT 'pending_office_review' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insured_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"national_id" varchar(10) NOT NULL,
	"insurance_number" varchar(30) NOT NULL,
	"state" varchar(24) DEFAULT 'introduced' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"recipient_role" "user_role" NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"request_id" uuid,
	"title_fa" varchar(200) NOT NULL,
	"body_fa" text NOT NULL,
	"dedupe_key" varchar(160),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_employee_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"insured_employee_id" uuid NOT NULL,
	"full_name_snapshot" varchar(150) NOT NULL,
	"insurance_number_snapshot" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"message_id" uuid,
	"employee_submission_id" uuid,
	"uploader_user_id" uuid NOT NULL,
	"uploader_role" "user_role" NOT NULL,
	"classification" varchar(32) NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"display_filename" varchar(255) NOT NULL,
	"detected_mime_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256_checksum" varchar(64) NOT NULL,
	"scan_state" varchar(32) DEFAULT 'not_configured' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_role" "user_role" NOT NULL,
	"message_kind" varchar(32) DEFAULT 'explanation' NOT NULL,
	"body" text NOT NULL,
	"visibility" varchar(20) DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_code" varchar(28) NOT NULL,
	"customer_id" uuid NOT NULL,
	"request_type" "request_type" NOT NULL,
	"driver_id" uuid,
	"workshop_id" uuid,
	"jalali_year" smallint NOT NULL,
	"jalali_month" smallint NOT NULL,
	"calendar_system" varchar(16) DEFAULT 'jalali' NOT NULL,
	"status" "request_status" DEFAULT 'registered' NOT NULL,
	"awaiting_customer_info" boolean DEFAULT false NOT NULL,
	"awaiting_customer_info_note" text,
	"cancellation_requested" boolean DEFAULT false NOT NULL,
	"cancellation_request_reason" text,
	"cancellation_requested_at" timestamp with time zone,
	"cancellation_decision" varchar(20),
	"cancellation_decision_note" text,
	"cancellation_decided_at" timestamp with time zone,
	"final_amount" bigint,
	"currency_unit" varchar(16) DEFAULT 'TOMAN' NOT NULL,
	"initial_explanation" text,
	"has_new_employee_submission" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_profile_type_chk" CHECK ((
        ("requests"."request_type" = 'driver' AND "requests"."driver_id" IS NOT NULL AND "requests"."workshop_id" IS NULL)
        OR
        ("requests"."request_type" = 'workshop' AND "requests"."workshop_id" IS NOT NULL AND "requests"."driver_id" IS NULL)
      )),
	CONSTRAINT "requests_jalali_month_chk" CHECK ("requests"."jalali_month" >= 1 AND "requests"."jalali_month" <= 12),
	CONSTRAINT "requests_final_amount_chk" CHECK ("requests"."final_amount" IS NULL OR "requests"."final_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"csrf_token" varchar(64) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(20) NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"force_password_change" boolean DEFAULT true NOT NULL,
	"initial_password_mode" varchar(32) DEFAULT 'national_id' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"workshop_name" varchar(200) NOT NULL,
	"workshop_code" varchar(50) NOT NULL,
	"contact_full_name" varchar(150) NOT NULL,
	"contact_national_id" varchar(10) NOT NULL,
	"review_state" varchar(32) DEFAULT 'pending_office_review' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insured_employees" ADD CONSTRAINT "insured_employees_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insured_employees" ADD CONSTRAINT "insured_employees_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_employee_submissions" ADD CONSTRAINT "request_employee_submissions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_employee_submissions" ADD CONSTRAINT "request_employee_submissions_insured_employee_id_insured_employees_id_fk" FOREIGN KEY ("insured_employee_id") REFERENCES "public"."insured_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_message_id_request_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."request_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_employee_submission_id_request_employee_submissions_id_fk" FOREIGN KEY ("employee_submission_id") REFERENCES "public"."request_employee_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_request_created_idx" ON "audit_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_uniq" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_mobile_uniq" ON "customers" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "customers_national_id_idx" ON "customers" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "customers_full_name_idx" ON "customers" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "drivers_customer_archived_idx" ON "drivers" USING btree ("customer_id","is_archived");--> statement-breakpoint
CREATE INDEX "drivers_national_id_idx" ON "drivers" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "insured_employees_workshop_idx" ON "insured_employees" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "insured_employees_customer_idx" ON "insured_employees" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_uniq" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "req_emp_sub_request_idx" ON "request_employee_submissions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_files_storage_key_uniq" ON "request_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "request_files_request_idx" ON "request_files" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_messages_request_created_idx" ON "request_messages" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_reference_code_uniq" ON "requests" USING btree ("reference_code");--> statement-breakpoint
CREATE INDEX "requests_customer_period_idx" ON "requests" USING btree ("customer_id","jalali_year","jalali_month");--> statement-breakpoint
CREATE INDEX "requests_driver_period_idx" ON "requests" USING btree ("driver_id","jalali_year","jalali_month");--> statement-breakpoint
CREATE INDEX "requests_workshop_period_idx" ON "requests" USING btree ("workshop_id","jalali_year","jalali_month");--> statement-breakpoint
CREATE INDEX "requests_status_created_idx" ON "requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requests_period_idx" ON "requests" USING btree ("jalali_year","jalali_month");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uniq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uniq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_role_active_idx" ON "users" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "workshops_customer_archived_idx" ON "workshops" USING btree ("customer_id","is_archived");--> statement-breakpoint
CREATE INDEX "workshops_code_idx" ON "workshops" USING btree ("workshop_code");