import type { Change, GirDocument } from "@globe/engine";
import { diffDocuments, parseGir, serializeGir } from "@globe/engine";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { returnVersions, type VersionElections } from "@/db/schema";
import { ApiError, notFound } from "@/lib/error";
import { requireReturn, touchReturn } from "./return-service";

/**
 * Versions are written, never edited.
 *
 * There is no update path in this module and that is deliberate: an UPDATE against
 * `return_versions` would rewrite history that a validation run already cites. The only
 * column that changes after the fact is `xml`, which is a cache of what the serializer
 * produces from the stored document, not part of the filer's record.
 */

/** The stored document, as the serializer's ordered tree. */
export type StoredDocument = GirDocument;

/**
 * Retries are for lost races, and a race is only lost when another writer commits
 * between this one reading the maximum and inserting. Nine concurrent saves can lose
 * several in a row, so the ceiling is well above the number of writers a single user
 * can realistically produce; reaching it means something other than contention.
 */
const MAX_VERSION_ATTEMPTS = 25;

/**
 * Writes the next version of a return.
 *
 * The number is computed inside the INSERT rather than read first and written second.
 * A separate `select max(version)` is a race: two saves both read 3, both write 4, and
 * without the unique constraint one silently overwrites the other. Computing it in the
 * same statement means each insert sees the rows already committed.
 *
 * That still leaves the gap between two concurrent statements, which the unique
 * constraint catches and the loop retries. `onConflictDoNothing` returns no row on a
 * collision, so an empty result is the signal to try again rather than an error to
 * report.
 */
export const createVersion = async (
  returnId: string,
  userId: string,
  document: StoredDocument,
  elections: VersionElections = {},
) => {
  await requireReturn(returnId, userId);

  for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt += 1) {
    const [created] = await db
      .insert(returnVersions)
      .values({
        returnId,
        version: sql<number>`(
          select coalesce(max(${returnVersions.version}), 0) + 1
          from ${returnVersions}
          where ${returnVersions.returnId} = ${returnId}
        )`,
        document,
        elections,
      })
      .onConflictDoNothing({ target: [returnVersions.returnId, returnVersions.version] })
      .returning({
        id: returnVersions.id,
        version: returnVersions.version,
        createdAt: returnVersions.createdAt,
      });

    if (created !== undefined) {
      await touchReturn(returnId);
      return created;
    }
  }

  throw new ApiError("CONFLICT", "Could not allocate a version number. Try again.");
};

export const listVersions = async (returnId: string, userId: string) => {
  await requireReturn(returnId, userId);

  return db
    .select({
      id: returnVersions.id,
      version: returnVersions.version,
      createdAt: returnVersions.createdAt,
      hasXml: isNotNull(returnVersions.xml),
    })
    .from(returnVersions)
    .where(eq(returnVersions.returnId, returnId))
    .orderBy(asc(returnVersions.version));
};

/**
 * One version of a return, by its number rather than its id.
 *
 * Ownership is checked first through `requireReturn`, so a version id belonging to
 * another user's return cannot be reached by guessing a number here.
 */
export const findVersion = async (returnId: string, userId: string, version: number) => {
  await requireReturn(returnId, userId);

  const [found] = await db
    .select({
      id: returnVersions.id,
      version: returnVersions.version,
      document: returnVersions.document,
      elections: returnVersions.elections,
      xml: returnVersions.xml,
      createdAt: returnVersions.createdAt,
    })
    .from(returnVersions)
    .where(and(eq(returnVersions.returnId, returnId), eq(returnVersions.version, version)))
    .limit(1);

  return found;
};

export const requireVersion = async (returnId: string, userId: string, version: number) => {
  const found = await findVersion(returnId, userId, version);
  if (found === undefined) throw notFound("Version");
  return found;
};

/** The most recent version of a return, or undefined when none has been saved. */
export const latestVersion = async (returnId: string, userId: string) => {
  await requireReturn(returnId, userId);

  const [found] = await db
    .select({
      id: returnVersions.id,
      version: returnVersions.version,
      document: returnVersions.document,
      elections: returnVersions.elections,
      xml: returnVersions.xml,
      createdAt: returnVersions.createdAt,
    })
    .from(returnVersions)
    .where(eq(returnVersions.returnId, returnId))
    .orderBy(desc(returnVersions.version))
    .limit(1);

  return found;
};

/**
 * Compares two versions of a return.
 *
 * The comparison itself is the engine's. Doing it here would mean the backend held an
 * opinion about document structure, which is the one thing this layer must not have.
 */
export const diffVersions = async (
  returnId: string,
  userId: string,
  from: number,
  to: number,
): Promise<readonly Change[]> => {
  const [before, after] = await Promise.all([
    requireVersion(returnId, userId, from),
    requireVersion(returnId, userId, to),
  ]);

  return diffDocuments(before.document as StoredDocument, after.document as StoredDocument);
};

/** Caches the serialized form on the version. The document itself is untouched. */
export const storeXml = async (versionId: string, xml: string): Promise<void> => {
  await db.update(returnVersions).set({ xml }).where(eq(returnVersions.id, versionId));
};

/**
 * Parses XML into the stored form.
 *
 * Kept here so the shape written to `document` is always what the serializer produces.
 * A hand-built projection would drift from what `serializeGir` can round-trip.
 */
export const documentFromXml = (xml: string): StoredDocument => {
  try {
    return parseGir(xml);
  } catch (error) {
    throw new ApiError(
      "UNPROCESSABLE_ENTITY",
      error instanceof Error
        ? `Could not parse the document: ${error.message}`
        : "Could not parse the document",
    );
  }
};

export const xmlFromDocument = (document: StoredDocument): string => serializeGir(document);
