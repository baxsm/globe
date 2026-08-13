import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import VersionsView from "@/components/returns/versions-view";
import { ApiError, api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { sessionCookie } from "@/lib/server-session";

/** `params` is a promise in Next 16. Reading it synchronously no longer merely warns. */
const VersionsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookie = await sessionCookie();
  const queryClient = getQueryClient();

  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.return(id),
        queryFn: () => api.getReturn(id, cookie),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.versions(id),
        queryFn: () => api.listVersions(id, cookie).then((data) => data.versions),
      }),
    ]);
  } catch (error) {
    // The API answers 404 both for a return that does not exist and for one owned by
    // someone else, which is the correct pair to be indistinguishable here too.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VersionsView returnId={id} />
    </HydrationBoundary>
  );
};

export default VersionsPage;
