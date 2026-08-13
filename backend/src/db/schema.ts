import type { Application, Finding, Suppression } from "@globe/engine";
import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The GIR's own structure is not modelled here.
 *
 * A return's content is the parsed document, stored as one `jsonb` value, plus the XML
 * the engine emits. The 540 element declarations in `GLOBEXML_v1.0.xsd` are the OECD's
 * to change; turning them into tables would duplicate the spec and force a migration
 * every time the schema is revised, which is the one thing known to be coming.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The container for one GIR being prepared.
 *
 * `schemaVersion` and `guidanceVersion` are per return rather than global. The guidance
 * is explicitly first-cycle and a revision is expected; a global setting would silently
 * re-interpret every existing return the day it changed, so a return keeps validating
 * under the version it was authored against.
 */
export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reportingPeriod: date("reporting_period").notNull(),
    mneGroupName: text("mne_group_name"),
    schemaVersion: text("schema_version").notNull(),
    guidanceVersion: text("guidance_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("returns_user_updated_idx").on(table.userId, table.updatedAt.desc())],
);

/**
 * One saved state of a return. Immutable once written.
 *
 * The unique constraint on `(return_id, version)` is the only thing that makes numbering
 * safe. Two saves that both read `max(version)` as 3 will both try to write 4, and
 * without the constraint both succeed and one filing silently overwrites the other in
 * every later read. The service retries on the conflict rather than sequencing in
 * application code, because application-level sequencing cannot see the other connection.
 */
export const returnVersions = pgTable(
  "return_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    document: jsonb("document").notNull(),
    xml: text("xml"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("return_versions_return_version_key").on(table.returnId, table.version)],
);

/** `clean` and `errors` describe the document. `engine_failed` describes the run itself. */
export type ValidationStatus = "clean" | "errors" | "engine_failed";

/**
 * The result of running the engine over a version.
 *
 * `suppressions` is its own column rather than a subset of `findings`. The four
 * disapplied rules are reported on every run including clean ones, and a run that
 * silently dropped them would be indistinguishable from a run where they were checked
 * and passed. Storing them separately means the distinction survives into the UI.
 */
export const validationRuns = pgTable(
  "validation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnVersionId: uuid("return_version_id")
      .notNull()
      .references(() => returnVersions.id, { onDelete: "cascade" }),
    status: text("status").$type<ValidationStatus>().notNull(),
    findings: jsonb("findings").$type<readonly Finding[]>().notNull(),
    suppressions: jsonb("suppressions").$type<readonly Suppression[]>().notNull(),
    computed: jsonb("computed").notNull(),
    engineVersion: text("engine_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("validation_runs_version_created_idx").on(table.returnVersionId, table.createdAt.desc()),
  ],
);

/**
 * Which of the fourteen fixes were applied to a version, and where.
 *
 * This is what the margin renders. `schemaExpected` beside `errataApplied` is the
 * difference the product exists to show, so both are stored rather than recomputed:
 * a later engine version would otherwise silently restate what an old run had found.
 */
export const errataApplications = pgTable(
  "errata_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnVersionId: uuid("return_version_id")
      .notNull()
      .references(() => returnVersions.id, { onDelete: "cascade" }),
    issueNumber: integer("issue_number").notNull(),
    kind: text("kind").$type<Application["kind"]>().notNull(),
    xpath: text("xpath").notNull(),
    schemaExpected: jsonb("schema_expected"),
    errataApplied: jsonb("errata_applied"),
    paragraph: text("paragraph").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    index("errata_applications_version_issue_idx").on(table.returnVersionId, table.issueNumber),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  returns: many(returns),
}));

export const returnsRelations = relations(returns, ({ one, many }) => ({
  user: one(users, { fields: [returns.userId], references: [users.id] }),
  versions: many(returnVersions),
}));

export const returnVersionsRelations = relations(returnVersions, ({ one, many }) => ({
  return: one(returns, { fields: [returnVersions.returnId], references: [returns.id] }),
  validationRuns: many(validationRuns),
  errataApplications: many(errataApplications),
}));

export const validationRunsRelations = relations(validationRuns, ({ one }) => ({
  version: one(returnVersions, {
    fields: [validationRuns.returnVersionId],
    references: [returnVersions.id],
  }),
}));

export const errataApplicationsRelations = relations(errataApplications, ({ one }) => ({
  version: one(returnVersions, {
    fields: [errataApplications.returnVersionId],
    references: [returnVersions.id],
  }),
}));
