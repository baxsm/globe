import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { returns, returnVersions } from "@/db/schema";
import { notFound } from "@/lib/error";
import { GUIDANCE_VERSION, SCHEMA_VERSION } from "@/lib/reference";

/**
 * Returns are always addressed by id **and** owner.
 *
 * Every read here takes a `userId` and filters on it rather than fetching by id and
 * checking afterwards. A missing check would leak another user's filing, and the version
 * routes nest two levels deep, which is exactly where an ownership check is easiest to
 * omit. Filtering in the query makes forgetting it a type error rather than a silent hole.
 */

export interface CreateReturnInput {
  readonly userId: string;
  readonly name: string;
  readonly reportingPeriod: string;
  readonly mneGroupName?: string | undefined;
}

export const createReturn = async (input: CreateReturnInput) => {
  const [created] = await db
    .insert(returns)
    .values({
      userId: input.userId,
      name: input.name,
      reportingPeriod: input.reportingPeriod,
      mneGroupName: input.mneGroupName ?? null,
      // Pinned at creation, never read from a global at validation time. A return keeps
      // being read against the versions it was authored against.
      schemaVersion: SCHEMA_VERSION,
      guidanceVersion: GUIDANCE_VERSION,
    })
    .returning({
      id: returns.id,
      name: returns.name,
      reportingPeriod: returns.reportingPeriod,
      mneGroupName: returns.mneGroupName,
      schemaVersion: returns.schemaVersion,
      guidanceVersion: returns.guidanceVersion,
      createdAt: returns.createdAt,
    });

  if (created === undefined) throw new Error("insert into returns returned no row");
  return created;
};

/** The user's returns, newest first, each with the number of its latest version. */
export const listReturns = async (userId: string) =>
  db
    .select({
      id: returns.id,
      name: returns.name,
      reportingPeriod: returns.reportingPeriod,
      mneGroupName: returns.mneGroupName,
      updatedAt: returns.updatedAt,
      latestVersion: sql<number>`coalesce(max(${returnVersions.version}), 0)`,
    })
    .from(returns)
    .leftJoin(returnVersions, eq(returnVersions.returnId, returns.id))
    .where(eq(returns.userId, userId))
    .groupBy(returns.id)
    .orderBy(desc(returns.updatedAt));

export const findReturn = async (returnId: string, userId: string) => {
  const [found] = await db
    .select({
      id: returns.id,
      name: returns.name,
      reportingPeriod: returns.reportingPeriod,
      mneGroupName: returns.mneGroupName,
      schemaVersion: returns.schemaVersion,
      guidanceVersion: returns.guidanceVersion,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
    })
    .from(returns)
    .where(and(eq(returns.id, returnId), eq(returns.userId, userId)))
    .limit(1);

  return found;
};

/** The same read, but raising rather than returning undefined. */
export const requireReturn = async (returnId: string, userId: string) => {
  const found = await findReturn(returnId, userId);
  if (found === undefined) throw notFound("Return");
  return found;
};

export interface UpdateReturnInput {
  readonly name?: string | undefined;
  readonly mneGroupName?: string | undefined;
}

/** Metadata only. The document lives in versions and is never edited in place. */
export const updateReturn = async (returnId: string, userId: string, input: UpdateReturnInput) => {
  await requireReturn(returnId, userId);

  const [updated] = await db
    .update(returns)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.mneGroupName === undefined ? {} : { mneGroupName: input.mneGroupName }),
      updatedAt: new Date(),
    })
    .where(and(eq(returns.id, returnId), eq(returns.userId, userId)))
    .returning({
      id: returns.id,
      name: returns.name,
      reportingPeriod: returns.reportingPeriod,
      mneGroupName: returns.mneGroupName,
      schemaVersion: returns.schemaVersion,
      guidanceVersion: returns.guidanceVersion,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
    });

  if (updated === undefined) throw notFound("Return");
  return updated;
};

/** Versions, runs and errata applications go with it, by cascade. */
export const deleteReturn = async (returnId: string, userId: string): Promise<void> => {
  const [deleted] = await db
    .delete(returns)
    .where(and(eq(returns.id, returnId), eq(returns.userId, userId)))
    .returning({ id: returns.id });

  if (deleted === undefined) throw notFound("Return");
};

/** Bumped whenever a version is written, so the list orders by real activity. */
export const touchReturn = async (returnId: string): Promise<void> => {
  await db.update(returns).set({ updatedAt: new Date() }).where(eq(returns.id, returnId));
};
