import type { Query, QueryClient } from "@tanstack/react-query";

const publicQueryPrefixes = new Set(["public", "marketplace"]);

function isPrivateQuery(query: Query) {
  const prefix = query.queryKey[0];
  const isSessionQuery = prefix === "auth" && query.queryKey[1] === "session";
  // Listing details can include the current buyer's saved state.
  if (prefix === "marketplace" && query.queryKey[1] === "listing") return true;
  return (
    !isSessionQuery &&
    (typeof prefix !== "string" || !publicQueryPrefixes.has(prefix))
  );
}

/** Remove data scoped to a signed-in identity while retaining public content. */
export async function clearPrivateQueryCache(queryClient: QueryClient) {
  const privateQueryFilter = { predicate: isPrivateQuery };
  await queryClient.cancelQueries(privateQueryFilter);
  queryClient.removeQueries(privateQueryFilter);
}
