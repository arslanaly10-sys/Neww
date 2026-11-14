CREATE TABLE "intakes" (
	"id" text PRIMARY KEY NOT NULL,
	"answers" jsonb NOT NULL,
	"run_id" text,
	"locale" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"lead_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text,
	"intake_id" text,
	"inputs" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"value_egp" bigint NOT NULL,
	"low_egp" bigint NOT NULL,
	"high_egp" bigint NOT NULL,
	"confidence" integer NOT NULL,
	"model_version" text NOT NULL,
	"assumptions_version" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD COLUMN "evidence_kind" text DEFAULT 'transaction' NOT NULL;--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD COLUMN "payment_terms" text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD COLUMN "source" text DEFAULT 'Sample registry extract (fictional)' NOT NULL;--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD COLUMN "source_date" date;--> statement-breakpoint
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valuation_runs_asset" ON "valuation_runs" USING btree ("asset_id","created_at");