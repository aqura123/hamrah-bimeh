CREATE TABLE "customer_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"encrypted_data" text NOT NULL,
	"last_four" varchar(4) NOT NULL,
	"holder_name" varchar(150) NOT NULL,
	"bank_id" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_mobiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"mobile" varchar(11) NOT NULL,
	"owner_name" varchar(150) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "mobile_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_cards" ADD CONSTRAINT "customer_cards_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_mobiles" ADD CONSTRAINT "customer_mobiles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_card_id_customer_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."customer_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_mobile_id_customer_mobiles_id_fk" FOREIGN KEY ("mobile_id") REFERENCES "public"."customer_mobiles"("id") ON DELETE set null ON UPDATE no action;