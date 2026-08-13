/** The typed shape of everything middleware puts on the request context. */
export interface AppEnv {
  Variables: {
    /** Set by `requireAuth`. Absent on `/api/auth/*` and on anonymous requests. */
    userId: string;
  };
}
