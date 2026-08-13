import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import ReturnDocument from "@/components/returns/return-document";
import { ApiError, api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { sessionCookie } from "@/lib/server-session";

/**
 * The document surface, without the margin.
 *
 * Phase 7 adds the errata annotations and the validation run beside this tree. What is
 * here is the left column of that layout, built so the margin can be added against the
 * node paths this already computes rather than by rewriting the tree.
 */
const ReturnPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookie = await sessionCookie();
  const queryClient = getQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.return(id),
      queryFn: () => api.getReturn(id, cookie),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReturnDocument returnId={id} />
    </HydrationBoundary>
  );
};

export default ReturnPage;
