CREATE TABLE "report_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"generated_by" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"datasets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" integer NOT NULL,
	"recipients" jsonb NOT NULL,
	"lang" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"next_run_on" date NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"lang" text NOT NULL,
	"generated_by" text NOT NULL,
	"content_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;