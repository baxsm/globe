/**
 * Every query key in one place.
 *
 * A prefetch on the server and a read in the browser have to agree exactly or the
 * client refetches data the server already sent, which shows up as a loading flash
 * rather than as an error. Writing the key twice is how they drift.
 */
export const queryKeys = {
  me: ["auth", "me"] as const,
  returns: ["returns"] as const,
  return: (id: string) => ["returns", id] as const,
  versions: (id: string) => ["returns", id, "versions"] as const,
  /** `null` where the return has no saved version, so the key is still stable. */
  validation: (id: string, version: number | null) =>
    ["returns", id, "versions", version, "validation"] as const,
  xml: (id: string, version: number) => ["returns", id, "versions", version, "xml"] as const,
  diff: (id: string, from: number, to: number) =>
    ["returns", id, "versions", from, "diff", to] as const,
  referenceIssues: ["reference", "issues"] as const,
  referenceSchema: ["reference", "schema"] as const,
};
