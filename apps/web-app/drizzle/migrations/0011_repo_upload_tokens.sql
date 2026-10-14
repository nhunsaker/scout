CREATE TABLE "repo_upload_tokens" (
	"repo_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_email" text NOT NULL,
	CONSTRAINT "repo_upload_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "scan_uploads" ADD COLUMN "token_repo_id" text;--> statement-breakpoint
ALTER TABLE "repo_upload_tokens" ADD CONSTRAINT "repo_upload_tokens_repo_id_repos_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("repo_id") ON DELETE cascade ON UPDATE no action;