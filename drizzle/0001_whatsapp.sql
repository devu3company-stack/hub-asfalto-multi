CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_chats" (
	"chat" text PRIMARY KEY NOT NULL,
	"name" text,
	"channel" text DEFAULT 'qr' NOT NULL,
	"ai_paused" boolean DEFAULT false NOT NULL,
	"last_text" text,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat" text NOT NULL,
	"channel" text NOT NULL,
	"from_me" boolean NOT NULL,
	"sent_by" text NOT NULL,
	"user_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wa_chats_last_at_idx" ON "wa_chats" USING btree ("last_at");--> statement-breakpoint
CREATE INDEX "wa_messages_chat_idx" ON "wa_messages" USING btree ("chat","created_at");