CREATE TABLE "agent_data_grants" (
	"agent_did" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_data_grants_agent_did_category_pk" PRIMARY KEY("agent_did","category")
);
--> statement-breakpoint
ALTER TABLE "audit_records" ADD COLUMN "detected_categories" jsonb;--> statement-breakpoint
ALTER TABLE "audit_records" ADD COLUMN "redacted_categories" jsonb;