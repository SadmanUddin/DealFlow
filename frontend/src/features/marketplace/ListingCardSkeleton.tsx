import { Card } from "@/components/ui/card";

export function ListingCardSkeleton() {
  return (
    <Card aria-hidden="true" className="overflow-hidden">
      <div className="aspect-[16/10] animate-pulse bg-mist" />
      <div className="space-y-4 p-5 sm:p-6">
        <div className="h-5 w-3/4 animate-pulse rounded bg-mist" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-mist" />
        <div className="space-y-2 py-2">
          <div className="h-3 w-full animate-pulse rounded bg-mist" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-mist" />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div className="h-8 animate-pulse rounded bg-mist" />
          <div className="h-8 animate-pulse rounded bg-mist" />
        </div>
      </div>
    </Card>
  );
}
