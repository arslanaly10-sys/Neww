CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"month" date NOT NULL,
	"category" text NOT NULL,
	"amount_egp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"amount_egp" bigint NOT NULL,
	"basis_noi_egp" bigint NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"proposed_by" text NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"paid_on" date
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text,
	"entry_date" date NOT NULL,
	"category" text NOT NULL,
	"amount_egp" bigint NOT NULL,
	"memo" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_lines_month" ON "budget_lines" USING btree ("month");--> statement-breakpoint
CREATE INDEX "ledger_entries_date" ON "ledger_entries" USING btree ("entry_date");