CREATE TABLE "conversation_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"uploaded_by" integer NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "conversation_documents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "conversation_documents_size_positive" CHECK ("conversation_documents"."size_bytes" BETWEEN 1 AND 10485760),
	CONSTRAINT "conversation_documents_sha256_format" CHECK ("conversation_documents"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "conversation_documents_status_valid" CHECK ("conversation_documents"."status" IN ('pending', 'available', 'rejected', 'deletion_pending'))
);
--> statement-breakpoint
ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_documents_conversation_created_idx" ON "conversation_documents" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "conversation_documents_cleanup_idx" ON "conversation_documents" USING btree ("status","deleted_at");