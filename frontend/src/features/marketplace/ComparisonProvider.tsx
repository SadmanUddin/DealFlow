import { useState, type ReactNode } from "react";
import { addComparisonListing, ComparisonContext } from "./comparison-context";

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  return (
    <ComparisonContext.Provider
      value={{
        ids,
        add: (id) => setIds((current) => addComparisonListing(current, id)),
        remove: (id) =>
          setIds((current) => current.filter((item) => item !== id)),
        clear: () => setIds([]),
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}
