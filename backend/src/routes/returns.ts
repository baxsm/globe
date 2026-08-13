import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "@/lib/context";
import { ApiError, notFound } from "@/lib/error";
import { validate } from "@/lib/validate";
import {
  createReturn,
  deleteReturn,
  listReturns,
  requireReturn,
  updateReturn,
} from "@/services/return-service";
import { generateXml, latestRun, runValidation } from "@/services/validation-service";
import {
  createVersion,
  diffVersions,
  documentFromXml,
  latestVersion,
  listVersions,
  requireVersion,
} from "@/services/version-service";

const createBody = z.object({
  name: z.string().min(1, "Give the return a name").max(200),
  reportingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, for example 2024-12-31"),
  mneGroupName: z.string().max(200).optional(),
});

const patchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    mneGroupName: z.string().max(200).optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.mneGroupName !== undefined,
    "Provide a field to change",
  );

/**
 * A version is saved as XML and stored as the parsed tree.
 *
 * Accepting XML rather than the tree means the wire format the filer holds is what gets
 * parsed, so a document that cannot round-trip is rejected at save time rather than at
 * export time, when it would be far less obvious what changed it.
 */
const versionBody = z.object({
  document: z.string().min(1, "The document is empty"),
});

/** A version number in a path. Rejects `0`, negatives and anything non-numeric. */
const versionParam = (raw: string | undefined): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError("BAD_REQUEST", "Version must be a positive whole number");
  }
  return parsed;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A return id from the path, checked before it reaches a query.
 *
 * Postgres rejects a malformed uuid at the cast, so without this the driver raises and
 * the request answers 500. A caller asking for an id that cannot exist is asking for
 * something absent, which is a 404. It also keeps a query that will certainly fail from
 * reaching the database at all.
 */
const returnIdParam = (raw: string | undefined): string => {
  if (raw === undefined || !UUID_PATTERN.test(raw)) throw notFound("Return");
  return raw;
};

export const returnRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json({ returns: await listReturns(c.get("userId")) }))

  .post("/", validate("json", createBody), async (c) => {
    const body = c.req.valid("json");

    return c.json(
      {
        return: await createReturn({
          userId: c.get("userId"),
          name: body.name,
          reportingPeriod: body.reportingPeriod,
          mneGroupName: body.mneGroupName,
        }),
      },
      201,
    );
  })

  .get("/:id", async (c) => {
    const userId = c.get("userId");
    const id = returnIdParam(c.req.param("id"));

    const [found, version] = await Promise.all([
      requireReturn(id, userId),
      latestVersion(id, userId),
    ]);

    // A return with no saved version yet is normal, not an error. The editor opens on an
    // empty document rather than a 404.
    return c.json({ return: found, version: version ?? null });
  })

  .patch("/:id", validate("json", patchBody), async (c) => {
    const body = c.req.valid("json");

    return c.json({
      return: await updateReturn(returnIdParam(c.req.param("id")), c.get("userId"), {
        name: body.name,
        mneGroupName: body.mneGroupName,
      }),
    });
  })

  .delete("/:id", async (c) => {
    await deleteReturn(returnIdParam(c.req.param("id")), c.get("userId"));
    return c.json({ ok: true });
  })

  .get("/:id/versions", async (c) =>
    c.json({ versions: await listVersions(returnIdParam(c.req.param("id")), c.get("userId")) }),
  )

  .post("/:id/versions", validate("json", versionBody), async (c) => {
    const { document } = c.req.valid("json");

    return c.json(
      {
        version: await createVersion(
          returnIdParam(c.req.param("id")),
          c.get("userId"),
          documentFromXml(document),
        ),
      },
      201,
    );
  })

  .get("/:id/versions/:version", async (c) => {
    const version = await requireVersion(
      returnIdParam(c.req.param("id")),
      c.get("userId"),
      versionParam(c.req.param("version")),
    );

    return c.json({ version });
  })

  .get("/:id/versions/:version/diff/:other", async (c) =>
    c.json({
      changes: await diffVersions(
        returnIdParam(c.req.param("id")),
        c.get("userId"),
        versionParam(c.req.param("version")),
        versionParam(c.req.param("other")),
      ),
    }),
  )

  .post("/:id/versions/:version/validate", async (c) => {
    const run = await runValidation(
      returnIdParam(c.req.param("id")),
      c.get("userId"),
      versionParam(c.req.param("version")),
    );

    // `errata` is a sibling of `run` in the response rather than a field inside it: the
    // applications belong to the version, and a second run of the same version replaces
    // them rather than adding to them.
    const { errata, ...rest } = run;
    return c.json({ run: rest, errata });
  })

  .get("/:id/versions/:version/validation", async (c) => {
    const run = await latestRun(
      returnIdParam(c.req.param("id")),
      c.get("userId"),
      versionParam(c.req.param("version")),
    );

    if (run === null) return c.json({ run: null, errata: [] });

    const { errata, ...rest } = run;
    return c.json({ run: rest, errata });
  })

  .post("/:id/versions/:version/xml", async (c) => {
    const { xml, byteLength } = await generateXml(
      returnIdParam(c.req.param("id")),
      c.get("userId"),
      versionParam(c.req.param("version")),
    );

    return c.json({ xml, byteLength });
  })

  .get("/:id/versions/:version/xml", async (c) => {
    const { xml } = await generateXml(
      returnIdParam(c.req.param("id")),
      c.get("userId"),
      versionParam(c.req.param("version")),
    );

    // `c.text` would send text/plain. A GIR is served as XML so a browser or a filing
    // tool treats it as the wire format it is.
    return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
  });
