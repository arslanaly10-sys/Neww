CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"asset_id" text,
	"severity" text NOT NULL,
	"route_role" text NOT NULL,
	"status" text NOT NULL,
	"snooze_reason" text,
	"detail" jsonb NOT NULL,
	"raised_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"proposed_by" text NOT NULL,
	"route_role" text NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"district_id" text NOT NULL,
	"type" text NOT NULL,
	"compound" text NOT NULL,
	"area_sqm" integer NOT NULL,
	"floor" integer,
	"finish" text NOT NULL,
	"year_built" integer,
	"acquired_on" date NOT NULL,
	"cost_egp" bigint NOT NULL,
	"value_egp" bigint NOT NULL,
	"value_set_on" date NOT NULL,
	"value_source" text NOT NULL,
	"occupancy" text NOT NULL,
	"vacant_since" date,
	"lat" numeric(9, 5) NOT NULL,
	"lng" numeric(9, 5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumption_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"author" text NOT NULL,
	"note" text NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"seq" integer PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"detail" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashflows" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"amount_egp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparable_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"district_id" text NOT NULL,
	"type" text NOT NULL,
	"area_sqm" integer NOT NULL,
	"floor" integer,
	"finish" text NOT NULL,
	"year_built" integer,
	"sold_on" date NOT NULL,
	"price_egp" bigint NOT NULL,
	"compound" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"lat" numeric(9, 5) NOT NULL,
	"lng" numeric(9, 5) NOT NULL,
	"base_ppsqm" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"sample_file" text,
	"extracted" jsonb,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "investor_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"posted_on" date NOT NULL,
	"title" text NOT NULL,
	"title_ar" text NOT NULL,
	"body" text NOT NULL,
	"body_ar" text NOT NULL,
	"status" text NOT NULL,
	"author_id" text NOT NULL,
	"asset_id" text
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_rent" bigint NOT NULL,
	"currency" text NOT NULL,
	"annual_indexation_pct" numeric(5, 2) NOT NULL,
	"deposit_months" integer NOT NULL,
	"clauses" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_series" (
	"district_id" text NOT NULL,
	"month" date NOT NULL,
	"price_index" numeric(8, 2) NOT NULL,
	CONSTRAINT "market_series_district_id_month_pk" PRIMARY KEY("district_id","month")
);
--> statement-breakpoint
CREATE TABLE "market_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_ar" text NOT NULL,
	"provenance" text NOT NULL,
	"published_on" date,
	"production_source" text NOT NULL,
	"production_source_ar" text NOT NULL,
	"note" text NOT NULL,
	"note_ar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"verification_hash" text NOT NULL,
	"head_seq" integer NOT NULL,
	"head_hash" text NOT NULL,
	"generated_by" text NOT NULL,
	"role" text NOT NULL,
	"lang" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"assumption_set_id" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"base_hash" text DEFAULT '' NOT NULL,
	"result_hash" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"sector" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"title" text NOT NULL,
	"title_ar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text,
	"assumption_set_id" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"model_estimate_egp" bigint NOT NULL,
	"final_value_egp" bigint,
	"adjustment_reason_code" text,
	"adjustment_reason" text,
	"status" text NOT NULL,
	"required_approvals" integer DEFAULT 1 NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_by" text NOT NULL,
	"confirmed_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "value_history" (
	"asset_id" text NOT NULL,
	"month" date NOT NULL,
	"value_egp" bigint NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "value_history_asset_id_month_pk" PRIMARY KEY("asset_id","month")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD CONSTRAINT "comparable_sales_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_updates" ADD CONSTRAINT "investor_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_updates" ADD CONSTRAINT "investor_updates_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_series" ADD CONSTRAINT "market_series_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_assumption_set_id_assumption_sets_id_fk" FOREIGN KEY ("assumption_set_id") REFERENCES "public"."assumption_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_assumption_set_id_assumption_sets_id_fk" FOREIGN KEY ("assumption_set_id") REFERENCES "public"."assumption_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_history" ADD CONSTRAINT "value_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_district_idx" ON "assets" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "cashflows_asset_idx" ON "cashflows" USING btree ("asset_id","month");--> statement-breakpoint
CREATE INDEX "sales_district_type_idx" ON "comparable_sales" USING btree ("district_id","type");