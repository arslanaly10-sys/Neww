CREATE TABLE "lease_renewals" (
	"lease_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"proposed_rent" bigint,
	"proposed_end" date,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rent_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"lease_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"period" date NOT NULL,
	"due_on" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"amount_egp" bigint NOT NULL,
	"paid_egp" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"last_reminder_on" date
);
--> statement-breakpoint
CREATE TABLE "rent_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_egp" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_contacts" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"contact_name" text NOT NULL,
	"contact_name_ar" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lease_renewals" ADD CONSTRAINT "lease_renewals_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_contacts" ADD CONSTRAINT "tenant_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rent_invoices_lease" ON "rent_invoices" USING btree ("lease_id","period");--> statement-breakpoint
CREATE INDEX "rent_invoices_status" ON "rent_invoices" USING btree ("status");