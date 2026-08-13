import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound, redirect } from "next/navigation";
import ReturnDocument from "@/components/returns/return-document";
import { ApiError, api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { sessionCookie } from "@/lib/server-session";

/**
 * The document surface: the return on the left, the margin on the right.
 *
 * Both the document and its latest validation run are prefetched here. Fetching the run
 * in the browser instead would render the tree first and drop the annotations in a frame
 * later, so every node would visibly reflow as the margin arrived.
 */
const ReturnPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookie = await sessionCookie();
  const queryClient = getQueryClient();

  try {
    const { version } = await queryClient.fetchQuery({
      queryKey: queryKeys.return(id),
      queryFn: () => api.getReturn(id, cookie),
    });

    if (version !== null) {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.validation(id, version.version),
        queryFn: () => api.getValidation(id, version.version, cookie),
      });
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    // A session that expired between the layout's guard and this fetch belongs at the
    // login screen. Letting it reach the error boundary shows "could not load this page"
    // for something a sign-in fixes.
    if (error instanceof ApiError && error.isUnauthorized) redirect("/login");
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReturnDocument returnId={id} />
    </HydrationBoundary>
  );
};

export default ReturnPage;
