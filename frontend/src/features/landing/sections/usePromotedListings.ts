import { useQuery } from "@tanstack/react-query";
import { getPublicListings } from "@/features/marketplace/marketplace-api";

export function usePromotedListings(sold = false) {
  const availability = sold ? "sold" : "available";
  return useQuery({
    queryKey: ["marketplace", "promotion", availability],
    queryFn: () =>
      getPublicListings({ page: 1, limit: 12, availability, sort: "newest" }),
    staleTime: 30_000,
  });
}
