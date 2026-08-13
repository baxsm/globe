import {
  defaultShouldDehydrateQuery,
  environmentManager,
  QueryClient,
} from "@tanstack/react-query";

/**
 * A new client per server request, one shared client in the browser.
 *
 * A module-level singleton on the server is a cache shared by every request, which in a
 * single-user product hides completely until a second session exists and then serves
 * one user's returns to another. `environmentManager.isServer()` is Query's own check
 * and is correct under prerender, where `typeof window` is not a reliable signal.
 */
const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that a client mount right after hydration does not immediately
        // refetch what the server already sent. A zero stale time is what produces the
        // "loading flash on prefetched data" this phase is explicitly watching for.
        staleTime: 60_000,
        retry: (failureCount, error) => {
          // A 4xx says the request itself was wrong, so repeating it cannot succeed and
          // only delays the redirect by the length of the backoff. The two exceptions ask
          // to be sent again: 408 timed out and 429 is asking for a slower pace.
          const status = (error as { status?: number }).status;
          const retryable = status === 408 || status === 429;
          if (status !== undefined && status >= 400 && status < 500 && !retryable) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        // Streams queries that are still pending when the shell flushes, so a slow
        // route does not have to block the whole document.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });

let browserQueryClient: QueryClient | undefined;

export const getQueryClient = (): QueryClient => {
  if (environmentManager.isServer()) return makeQueryClient();

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
};
