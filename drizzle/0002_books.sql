CREATE TABLE "book" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"book_key" text NOT NULL,
	"title" text NOT NULL,
	"authors" text[] NOT NULL,
	"first_publish_year" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_list_id_book_key_unique" UNIQUE("list_id","book_key")
);
--> statement-breakpoint
ALTER TABLE "book" ADD CONSTRAINT "book_list_id_reading_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."reading_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_list_id_created_at_idx" ON "book" USING btree ("list_id","created_at");