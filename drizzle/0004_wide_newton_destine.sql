ALTER TYPE "public"."request_status" ADD VALUE 'awaiting_payment' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "payment_card_number" varchar(16);