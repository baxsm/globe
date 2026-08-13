import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { errorBody } from "./error";

/**
 * `zValidator` with the API's error shape.
 *
 * Left alone, a failed validation returns `{ success: false, error: ... }` with the whole
 * serialized ZodError, which is neither the `{ error: { code, message } }` every other
 * failure uses nor something a person can read. It also short-circuits the response
 * rather than throwing, so `app.onError` never sees it and cannot normalise it there.
 *
 * The first issue's message is the one returned, because each schema here writes its own
 * messages and the first failure is the one worth fixing.
 */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;

    const [issue] = result.error.issues;
    const message = issue?.message ?? "The request is not valid";

    return c.json(errorBody("BAD_REQUEST", message), 400);
  });
