CREATE TABLE "errata_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_version_id" uuid NOT NULL,
	"issue_number" integer NOT NULL,
	"kind" text NOT NULL,
	"xpath" text NOT NULL,
	"schema_expected" jsonb,
	"errata_applied" jsonb,
	"paragraph" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"xml" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_versions_return_version_key" UNIQUE("return_id","version")
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reporting_period" date NOT NULL,
	"mne_group_name" text,
	"schema_version" text NOT NULL,
	"guidance_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_version_id" uuid NOT NULL,
	"status" text NOT NULL,
	"findings" jsonb NOT NULL,
	"suppressions" jsonb NOT NULL,
	"computed" jsonb NOT NULL,
	"engine_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "errata_applications" ADD CONSTRAINT "errata_applications_return_version_id_return_versions_id_fk" FOREIGN KEY ("return_version_id") REFERENCES "public"."return_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_versions" ADD CONSTRAINT "return_versions_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_return_version_id_return_versions_id_fk" FOREIGN KEY ("return_version_id") REFERENCES "public"."return_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "errata_applications_version_issue_idx" ON "errata_applications" USING btree ("return_version_id","issue_number");--> statement-breakpoint
CREATE INDEX "returns_user_updated_idx" ON "returns" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "validation_runs_version_created_idx" ON "validation_runs" USING btree ("return_version_id","created_at" DESC NULLS LAST);