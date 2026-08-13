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

  referenceIssues: (cookie?: string) =>
    request<{ issues: IssueReference[] }>("/reference/issues", { ...withCookie(cookie) }),

  referenceSchema: (cookie?: string) =>
    request<SchemaReference>("/reference/schema", { ...withCookie(cookie) }),
};

/** A stored version as `GET /api/returns/:id` returns it. */
export interface StoredVersion {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly document: unknown;
}

const withCookie = (cookie: string | undefined) => (cookie === undefined ? {} : { cookie });
