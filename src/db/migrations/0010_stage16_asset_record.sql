CREATE TABLE "asset_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"unit" text,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"source_label" text NOT NULL,
	"observed_on" date NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"actor_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"floors" integer,
	"year_built" integer,
	"structure" text DEFAULT 'concrete_frame' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"seq" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount_egp" bigint NOT NULL,
	"paid_on" date
);
--> statement-breakpoint
CREATE TABLE "ownership_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"holder" text NOT NULL,
	"holder_ar" text NOT NULL,
	"share_pct" numeric(5, 2) NOT NULL,
	"since" date NOT NULL,
	"source_doc_id" text
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"owner_id" text,
	"base_currency" text DEFAULT 'EGP' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"building_id" text,
	"label" text NOT NULL,
	"use" text NOT NULL,
	"area_sqm" integer NOT NULL,
	"floor" integer,
	"beds" integer,
	"baths" integer,
	"status" text NOT NULL,
	"lease_id" text
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "portfolio_id" text DEFAULT 'P-001' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "plot_area_sqm" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "delivery_on" date;--> statement-breakpoint
ALTER TABLE "asset_facts" ADD CONSTRAINT "asset_facts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_shares" ADD CONSTRAINT "ownership_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_facts_asset" ON "asset_facts" USING btree ("asset_id","field");--> statement-breakpoint
CREATE INDEX "asset_versions_asset" ON "asset_versions" USING btree ("asset_id","version");--> statement-breakpoint
CREATE INDEX "installments_asset" ON "installments" USING btree ("asset_id","seq");--> statement-breakpoint
CREATE INDEX "ownership_asset" ON "ownership_shares" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "units_asset" ON "units" USING btree ("asset_id");