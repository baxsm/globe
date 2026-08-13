import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import ReferenceView from "@/components/reference/reference-view";
import { api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { sessionCookie } from "@/lib/server-session";

const ReferencePage = async () => {
  const cookie = await sessionCookie();
  const queryClient = getQueryClient();

  // The schema reference is already in the layout's cache; only the issues need
  // fetching here. Both are read by the client component below.
  await queryClient.prefetchQuery({
    queryKey: queryKeys.referenceIssues,
    queryFn: () => api.referenceIssues(cookie).then((data) => data.issues),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReferenceView />
    </HydrationBoundary>
  );
};

export default ReferencePage;
