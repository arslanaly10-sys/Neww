CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"layer" text NOT NULL,
	"access" text NOT NULL,
	"licence" text NOT NULL,
	"homepage" text NOT NULL,
	"cadence_days" integer,
	"coverage" text NOT NULL,
	"coverage_ar" text NOT NULL,
	"note" text NOT NULL,
	"note_ar" text NOT NULL,
	"last_import_at" timestamp with time zone,
	"last_status" text,
	"last_rows" integer,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"error" text,
	"triggered_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"indicator" text NOT NULL,
	"label" text NOT NULL,
	"location" text NOT NULL,
	"location_kind" text NOT NULL,
	"period" text NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"unit" text NOT NULL,
	"currency" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"licence" text NOT NULL,
	"transform" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_observations" ADD CONSTRAINT "market_observations_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "obs_key" ON "market_observations" USING btree ("source_id","indicator","location","period");--> statement-breakpoint
CREATE INDEX "obs_location" ON "market_observations" USING btree ("location");