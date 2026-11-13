CREATE TABLE "deal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"title_ar" text,
	"district_id" text NOT NULL,
	"type" text NOT NULL,
	"area_sqm" integer,
	"asset_id" text,
	"asking_egp" bigint NOT NULL,
	"offer_egp" bigint,
	"stage" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"owner_id" text NOT NULL,
	"counterparty" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'broker' NOT NULL,
	"expected_close" date,
	"notes" text DEFAULT '' NOT NULL,
	"lost_reason" text,
	"shared" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_on" date
);
--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_events_deal" ON "deal_events" USING btree ("deal_id","at");--> statement-breakpoint
CREATE INDEX "deals_stage" ON "deals" USING btree ("stage","position");