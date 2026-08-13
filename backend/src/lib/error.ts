import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * The error codes the API returns, and the status each maps to.
 *
 * `ENGINE_FAILED` is separate from `INTERNAL` on purpose. An engine crash is recorded as
 * a `validation_runs` row with that status, so the client can distinguish a run that
 * failed from a request that never reached the engine, and the failure stays visible in
 * the return's history rather than being lost.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  ENGINE_FAILED: 500,
  INTERNAL: 500,
} as const satisfies Record<string, ContentfulStatusCode>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
}

/**
 * An error with a code the router knows how to turn into a response.
 *
 * Thrown by services so a handler does not have to branch on every failure. Anything
 * thrown that is not one of these is treated as unexpected and its message is never
 * shown to the client.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string): ApiError => new ApiError("NOT_FOUND", `${what} not found`);

/**
 * Patterns that mean the message came from the database or the driver.
 *
 * A Postgres error carries the failing statement and its parameters, which for this
 * product includes the contents of a filer's return. None of it goes to the client.
 */
const SENSITIVE = [
  "failed query",
  "insert into",
  "update ",
  "delete from",
  "select ",
  "params:",
  "postgres",
  "pg_",
  "drizzle",
  "econnrefused",
  "database",
  "relation ",
  "column ",
  "constraint",
  "violates",
  "duplicate key",
  "password",
];

/** A message safe to return, or a generic one when the original leaks internals. */
export const sanitizeErrorMessage = (error: unknown): string => {
  const generic = "Something went wrong. Try again.";
  if (!(error instanceof Error)) return generic;

  const message = error.message;
  const lowered = message.toLowerCase();

  if (SENSITIVE.some((pattern) => lowered.includes(pattern))) return generic;
  if (message.length > 200) return generic;

  return message;
};

export const errorBody = (code: ErrorCode, message: string, details?: unknown): ApiErrorBody =>
  details === undefined ? { error: { code, message } } : { error: { code, message, details } };
