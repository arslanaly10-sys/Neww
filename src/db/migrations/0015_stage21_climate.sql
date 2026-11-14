CREATE TABLE "climate_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"hazard" text NOT NULL,
	"level" integer NOT NULL,
	"method" text NOT NULL,
	"note" text NOT NULL,
	"assessed_on" date NOT NULL,
	"document_id" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "climate_assessments" ADD CONSTRAINT "climate_assessments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "climate_asset" ON "climate_assessments" USING btree ("asset_id","hazard");