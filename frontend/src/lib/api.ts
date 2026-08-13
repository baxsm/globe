import { env } from "./env";

/**
 * The one place the backend is spoken to.
 *
 * The API is Hono over REST, not tRPC, so there is no generated client and the response
 * types here are written by hand against `docs/api.md` and the handlers themselves.
 * They are asserted rather than inferred, which is a real risk: a field renamed in the
 * backend compiles fine here and fails at runtime. `src/lib/_tests/api-contract.test.ts`
 * exists to catch exactly that, by checking these shapes against the live server.
 */

/** The uniform error body every failing route returns. */
export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the session is absent or no longer verifies, which the shell redirects on. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * Server and browser resolve the API differently.
 *
 * In the browser the request goes to the public origin and the cookie rides along
 * because the fetch sets credentials. On the server there is no ambient cookie jar at
 * all, so the caller has to pass the header through; `serverApi` does that and is the
 * only thing Server Components should use.
 */
const baseUrl = (): string =>
  typeof window === "undefined"
    ? (env.INTERNAL_API_URL ?? env.NEXT_PUBLIC_API_URL)
    : env.NEXT_PUBLIC_API_URL;

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  /** Forwarded from `cookies()` when the call originates on the server. */
  readonly cookie?: string;
  readonly signal?: AbortSignal;
  /** Set for routes that answer XML rather than JSON. */
  readonly accept?: "json" | "text";
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", body, cookie, signal, accept = "json" } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie !== undefined && cookie.length > 0) headers.Cookie = cookie;

  let response: Response;

  try {
    response = await fetch(`${baseUrl()}/api${path}`, {
      method,
      headers,
      // Sends the session cookie cross-origin. Without it every browser call is
      // anonymous and the app looks logged out immediately after logging in.
      credentials: "include",
      // The session is per-user and versions change on save. A cached response here
      // would show one user's return after a logout, and a stale list after a create.
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // A refused connection is not an application error and must not read as one. The
    // backend being down is the single most likely local failure and deserves to say so.
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "network_error", "Could not reach the API. Check it is running.");
  }

  if (!response.ok) throw await toApiError(response);

  if (accept === "text") return (await response.text()) as T;
  return (await response.json()) as T;
};

/**
 * Turns a failed response into an error carrying the backend's own code.
 *
 * A route that fails before the JSON handler, or a proxy in front of it, answers HTML.
 * Parsing that as JSON throws inside the error path and replaces a useful 502 with a
 * misleading syntax error, so the body is only read as JSON when it says it is.
 */
const toApiError = async (response: Response): Promise<ApiError> => {
  const fallback = `Request failed with status ${response.status}`;

  if (!response.headers.get("content-type")?.includes("application/json")) {
    return new ApiError(response.status, "http_error", fallback);
  }

  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;

    if (error === undefined) return new ApiError(response.status, "http_error", fallback);
    return new ApiError(response.status, error.code, error.message || fallback);
  } catch {
    return new ApiError(response.status, "http_error", fallback);
  }
};

export interface User {
  readonly id: string;
  readonly email: string;
}

export interface ReturnSummary {
  readonly id: string;
  readonly name: string;
  readonly reportingPeriod: string;
  readonly mneGroupName: string | null;
  readonly updatedAt: string;
  /** Coalesced to 0 by the query, so a return with no saved version reports 0, not null. */
  readonly latestVersion: number;
}

export interface ReturnRecord {
  readonly id: string;
  readonly name: string;
  readonly reportingPeriod: string;
  readonly mneGroupName: string | null;
  readonly schemaVersion: string;
  readonly guidanceVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What `POST /api/returns` actually returns.
 *
 * The insert's `returning` clause omits `updatedAt`, so this is `ReturnRecord` minus
 * that field rather than the same shape. Typing it as the full record would compile and
 * then render "Invalid Date" the moment a caller read the missing column.
 */
export type CreatedReturn = Omit<ReturnRecord, "updatedAt">;

export interface VersionSummary {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly hasXml: boolean;
}

export interface IssueReference {
  readonly number: number;
  readonly title: string;
  readonly kind: "substitution" | "augmentation" | "suppression" | "coercion";
  readonly paragraph: string;
  readonly summary: string;
  /**
   * The validation rule the issue disapplies, null when it disapplies none.
   *
   * Four of the five suppressions are numbered rules; issue 3 suppresses an element.
   * Counting `kind` to get the disapplied rules gives five and is wrong.
   */
  readonly validationRule: number | null;
}

export interface SchemaReference {
  readonly schemaVersion: string;
  readonly guidanceVersion: string;
  readonly guidanceApproved: string;
  readonly files: ReadonlyArray<{ readonly name: string; readonly bytes: number }>;
}

/**
 * The API surface, one function per route.
 *
 * Each takes an optional cookie so the same function serves a Server Component prefetch
 * and a browser call. Duplicating them into server and client halves would mean two
 * places to change when a route moves.
 */
export const api = {
  me: (cookie?: string) => request<{ user: User | null }>("/auth/me", { ...withCookie(cookie) }),

  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: { email, password } }),

  register: (email: string, password: string) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: { email, password } }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  listReturns: (cookie?: string) =>
    request<{ returns: ReturnSummary[] }>("/returns", { ...withCookie(cookie) }),

  createReturn: (body: { name: string; reportingPeriod: string; mneGroupName?: string }) =>
    request<{ return: CreatedReturn }>("/returns", { method: "POST", body }),

  getReturn: (id: string, cookie?: string) =>
    request<{ return: ReturnRecord; version: StoredVersion | null }>(`/returns/${id}`, {
      ...withCookie(cookie),
    }),

  deleteReturn: (id: string) => request<{ ok: true }>(`/returns/${id}`, { method: "DELETE" }),

  listVersions: (id: string, cookie?: string) =>
    request<{ versions: VersionSummary[] }>(`/returns/${id}/versions`, { ...withCookie(cookie) }),

  /**
   * Saves a GIR against a return, as the wire XML the filer holds.
   *
   * `elections` carries the four facts the errata cannot read off the document. A 7.1.2
   * and a 7.2.2 election are identical once serialized, and a safe harbour computation
   * looks like an ordinary one, so issues 2, 4, 6 and 7 stay dormant unless the filer
   * states them here.
   */
  createVersion: (id: string, body: { document: string; elections?: VersionElections }) =>
    request<{ version: VersionSummary }>(`/returns/${id}/versions`, { method: "POST", body }),

  referenceIssues: (cookie?: string) =>
    request<{ issues: IssueReference[] }>("/reference/issues", { ...withCookie(cookie) }),

  referenceSchema: (cookie?: string) =>
    request<SchemaReference>("/reference/schema", { ...withCookie(cookie) }),

  /** The most recent run, without starting one. `run` is null if never validated. */
  getValidation: (id: string, version: number, cookie?: string) =>
    request<ValidationResponse>(`/returns/${id}/versions/${version}/validation`, {
      ...withCookie(cookie),
    }),

  runValidation: (id: string, version: number) =>
    request<ValidationResponse>(`/returns/${id}/versions/${version}/validate`, { method: "POST" }),

  /**
   * The wire format, with the errata applied.
   *
   * The GET route answers `application/xml`, so this reads the body as text. Parsing it
   * as JSON would throw inside the client and replace the document with a syntax error.
   */
  getXml: (id: string, version: number, cookie?: string) =>
    request<string>(`/returns/${id}/versions/${version}/xml`, {
      accept: "text",
      ...withCookie(cookie),
    }),

  diffVersions: (id: string, from: number, to: number, cookie?: string) =>
    request<{ changes: DocumentChange[] }>(`/returns/${id}/versions/${from}/diff/${to}`, {
      ...withCookie(cookie),
    }),
};

/**
 * What the filer states alongside the document, mirroring the backend's `electionsBody`.
 *
 * Every field is optional and absent means "not elected". The backend rejects unknown
 * keys, so a field renamed on one side fails the save rather than silently disabling the
 * fix it gates.
 */
export interface VersionElections {
  /** Issue 2: which `UPEAdjustments` elected Article 7.1.2, by 0-based position. */
  readonly article712BasisIndices?: readonly number[];
  /** Issue 7: the safe harbour, which writes zeros the schema has no other way to carry. */
  readonly safeHarbourApplies?: boolean;
  /** Issue 4: a whole number of currency units, kept as a string past what JSON holds exactly. */
  readonly equityInclusionAmount?: string;
  /** Issue 6: TINs for the Unclaimed Accrual Annual Election, empty when aggregated. */
  readonly unclaimedAccrualAnnualTins?: readonly string[];
}

/** A stored version as `GET /api/returns/:id` returns it. */
export interface StoredVersion {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly document: unknown;
}

/**
 * One errata correction, at one place in one document.
 *
 * `xpath` addresses the node the annotation belongs beside. It carries a 1-based ordinal
 * on any segment whose name repeats, so three `JurisdictionSection` elements produce
 * three distinct addresses rather than one shared between them.
 */
export interface ErrataApplication {
  readonly issueNumber: number;
  readonly kind: IssueReference["kind"];
  readonly xpath: string;
  readonly schemaExpected: string;
  readonly errataApplied: string;
  readonly paragraph: string;
  readonly reason: string;
}

/** A rule the guidance says must not be applied, reported on every run. */
export interface SuppressionRecord {
  readonly issue: number;
  readonly validationRule: number;
  readonly paragraph: string;
  readonly reason: string;
}

export interface Finding {
  readonly rule: number;
  readonly severity: "error" | "warning" | "info";
  readonly path: string;
  readonly message: string;
  readonly issue: number | null;
}

export interface ComputedJurisdiction {
  readonly code: string | null;
  /** Decimal strings, never floats. `0.1000` and `0.1` are different filings. */
  readonly etrRate: string | null;
  readonly topUpTaxPercentage: string | null;
  readonly topUpTax: string | null;
  readonly additionalTopUpTax: string;
  readonly excessProfits: string;
  /** Why the schema cannot carry the computed rate. Empty when it can. */
  readonly breaches: readonly string[];
  readonly roundingBreachesTolerance: boolean;
}

export interface ValidationRun {
  readonly id: string;
  readonly status: "clean" | "errors" | "engine_failed";
  readonly engineVersion: string;
  readonly createdAt: string;
  readonly findings: readonly Finding[];
  readonly suppressions: readonly SuppressionRecord[];
  readonly computed: { readonly jurisdictions: readonly ComputedJurisdiction[] };
}

/** `run` is null only when the version has never been validated. */
export interface ValidationResponse {
  readonly run: ValidationRun | null;
  readonly errata: readonly ErrataApplication[];
}

export interface DocumentChange {
  readonly xpath: string;
  readonly kind: "added" | "removed" | "changed";
  readonly before: string | null;
  readonly after: string | null;
}

const withCookie = (cookie: string | undefined) => (cookie === undefined ? {} : { cookie });
