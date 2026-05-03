ALTER TABLE "project_note_pages" ADD COLUMN "kind" text DEFAULT 'note' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_note_pages" ADD COLUMN "section_id" text;--> statement-breakpoint
ALTER TABLE "project_note_pages" ADD COLUMN "parent_section_id" text;--> statement-breakpoint
ALTER TABLE "project_note_pages" ADD COLUMN "linked_entity_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_note_pages" ADD COLUMN "linked_entity_id" text;--> statement-breakpoint
ALTER TABLE "project_note_pages" ADD COLUMN "system_key" text;
