import { createContext, useContext } from "react";

export const comparisonLimit = 3;

export function addComparisonListing(ids: number[], id: number) {
  if (ids.includes(id) || ids.length >= comparisonLimit) return ids;
  return [...ids, id];
}

export const ComparisonContext = createContext<{
  ids: number[];
  add: (id: number) => void;
  remove: (id: number) => void;
  clear: () => void;
} | null>(null);

export function useComparison() {
  const comparison = useContext(ComparisonContext);
  if (!comparison) throw new Error("ComparisonProvider is required");
  return comparison;
}
