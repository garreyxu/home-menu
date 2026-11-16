CREATE TABLE "drinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notion_page_id" text NOT NULL,
	"name" text NOT NULL,
	"base_spirits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flavors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ingredients" text,
	"source_url" text,
	"tried" boolean DEFAULT false NOT NULL,
	"recipe_blocks" jsonb,
	"has_body" boolean DEFAULT false NOT NULL,
	"photo" text,
	"photo_type" text,
	"photo_fingerprint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drinks_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE INDEX "drinks_name_idx" ON "drinks" USING btree ("name");