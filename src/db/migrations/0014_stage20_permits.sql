CREATE TABLE "permits" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"form" text,
	"authority" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"applied_on" date,
	"issued_on" date,
	"expires_on" date,
	"document_id" text,
	"note" text DEFAULT '' NOT NULL,
	"verification" text DEFAULT 'unverified' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"reminded_on" date,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permits_asset" ON "permits" USING btree ("asset_id","kind");