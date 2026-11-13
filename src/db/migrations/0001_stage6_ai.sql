CREATE TABLE "horus_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"pages" integer NOT NULL,
	"sha256" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horus_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horus_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"locale" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"ref_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "horus_files" ADD CONSTRAINT "horus_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horus_messages" ADD CONSTRAINT "horus_messages_thread_id_horus_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."horus_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horus_messages" ADD CONSTRAINT "horus_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horus_threads" ADD CONSTRAINT "horus_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "horus_messages_thread" ON "horus_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "horus_threads_user" ON "horus_threads" USING btree ("user_id","updated_at");