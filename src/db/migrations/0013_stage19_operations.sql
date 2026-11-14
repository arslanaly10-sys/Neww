CREATE TABLE "capex_items" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"title" text NOT NULL,
	"title_ar" text,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"budget_egp" bigint NOT NULL,
	"spent_egp" bigint DEFAULT 0 NOT NULL,
	"useful_life_years" integer,
	"expected_uplift_egp" bigint,
	"start_on" date,
	"completed_on" date,
	"contractor_id" text,
	"proposed_by" text NOT NULL,
	"decided_by" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"trade" text NOT NULL,
	"email" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"scheduled_on" date NOT NULL,
	"inspector_id" text,
	"contractor_id" text,
	"status" text NOT NULL,
	"result" text,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"done_on" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utility_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"utility" text NOT NULL,
	"read_on" date NOT NULL,
	"reading" numeric(14, 2) NOT NULL,
	"cost_egp" bigint,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "contractor_id" text;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "rated_by" text;--> statement-breakpoint
ALTER TABLE "capex_items" ADD CONSTRAINT "capex_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capex_items" ADD CONSTRAINT "capex_items_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capex_items" ADD CONSTRAINT "capex_items_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspections_asset" ON "inspections" USING btree ("asset_id","scheduled_on");--> statement-breakpoint
CREATE INDEX "utility_asset" ON "utility_readings" USING btree ("asset_id","utility","read_on");