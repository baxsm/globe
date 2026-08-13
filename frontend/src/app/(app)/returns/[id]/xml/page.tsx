import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound, redirect } from "next/navigation";
import XmlView from "@/components/returns/xml-view";
import { ApiError, api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { sessionCookie } from "@/lib/server-session";

/**
 * The export surface.
 *
 * The XML and the validation run are both prefetched, because the marks are the
 * intersection of the two. Fetching either in the browser would render the document
 * unmarked first and then repaint every marked line.
 */
const XmlPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookie = await sessionCookie();
  const queryClient = getQueryClient();

  try {
    const { version } = await queryClient.fetchQuery({
      queryKey: queryKeys.return(id),
      queryFn: () => api.getReturn(id, cookie),
    });

    if (version !== null) {
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: queryKeys.xml(id, version.version),
          queryFn: () => api.getXml(id, version.version, cookie),
        }),
        queryClient.prefetchQuery({
          queryKey: queryKeys.validation(id, version.version),
          queryFn: () => api.getValidation(id, version.version, cookie),
        }),
      ]);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.isUnauthorized) redirect("/login");
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <XmlView returnId={id} />
    </HydrationBoundary>
  );
};

export default XmlPage;
