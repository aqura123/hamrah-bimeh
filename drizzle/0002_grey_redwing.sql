ALTER TABLE "customer_cards" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_mobiles" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;