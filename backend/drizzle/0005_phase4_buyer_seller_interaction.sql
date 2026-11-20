CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_distinct_participants" CHECK ("conversations"."buyer_id" <> "conversations"."seller_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp (3) with time zone,
	CONSTRAINT "messages_content_nonempty_and_bounded" CHECK (char_length(trim("messages"."content")) BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "business_listings_id_seller_id_uidx" ON "business_listings" USING btree ("id","seller_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_seller_fk" FOREIGN KEY ("listing_id","seller_id") REFERENCES "public"."business_listings"("id","seller_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_listing_buyer_uidx" ON "conversations" USING btree ("listing_id","buyer_id");--> statement-breakpoint
CREATE INDEX "conversations_buyer_created_idx" ON "conversations" USING btree ("buyer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversations_seller_created_idx" ON "conversations" USING btree ("seller_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_id_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_conversation_unread_sender_idx" ON "messages" USING btree ("conversation_id","sender_id") WHERE "messages"."read_at" IS NULL;
