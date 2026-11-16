CREATE TABLE "e_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"status" text NOT NULL,
	"document" text NOT NULL,
	"canonical_hash" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"signature" text,
	"key_id" text,
	"signed_by" text,
	"signed_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"public_key_pem" text NOT NULL,
	"fingerprint" text NOT NULL,
	"test" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "e_invoices_invoice" ON "e_invoices" USING btree ("invoice_id");