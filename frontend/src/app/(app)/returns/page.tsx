import ReturnsList from "@/components/returns/returns-list";

/**
 * The list is prefetched by the app layout, which the palette also reads.
 *
 * Prefetching it again here would be a second identical fetch on every navigation into
 * this route. The `HydrationBoundary` from the layout already covers this subtree.
 */
const ReturnsPage = () => <ReturnsList />;

export default ReturnsPage;
