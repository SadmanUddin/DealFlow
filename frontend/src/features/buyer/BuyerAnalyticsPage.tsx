import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listDeals } from "@/features/deals/api";
import { listFavorites } from "./api";

type CountRow = { label: string; count: number };

function distribution(
  values: Array<string | null>,
  fallback: string,
): CountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim() || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function currencyFormat(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function priceBandRows(values: number[], currency: string) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    return [{ label: currencyFormat(minimum, currency), count: values.length }];
  }
  const step = (maximum - minimum) / 4;
  const result = Array.from({ length: 4 }, (_, index) => {
    const lower = minimum + step * index;
    const upper = index === 3 ? maximum : minimum + step * (index + 1);
    return {
      label: `${currencyFormat(lower, currency)}–${currencyFormat(upper, currency)}`,
      count: 0,
      lower,
      upper,
    };
  });
  for (const value of values) {
    const index =
      value === maximum ? 3 : Math.min(3, Math.floor((value - minimum) / step));
    result[index].count += 1;
  }
  return result.map(({ label, count }) => ({ label, count }));
}

function DistributionChart({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: CountRow[];
}) {
  return (
    <SectionCard>
      <SectionHeading description={description} title={title} />
      {rows.length ? (
        <div aria-label={title} className="h-64 w-full" role="img">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 8, bottom: 8, left: -18 }}
            >
              <CartesianGrid
                stroke="#e7ece8"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: "#607069", fontSize: 10 }}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: "#87948d", fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#f3f7f5" }}
                contentStyle={{
                  border: "1px solid #e3e9e4",
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="count"
                fill="#0B1F36"
                maxBarSize={44}
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <WorkspaceEmpty
          description="Save published opportunities to see their distribution here."
          title="Not enough saved businesses"
        />
      )}
    </SectionCard>
  );
}

export function BuyerAnalyticsPage() {
  const favoritesQuery = useQuery({
    queryKey: ["buyer", "favorites", 1, 100],
    queryFn: () => listFavorites(1, 100),
    staleTime: 20_000,
  });
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", 1, 100],
    queryFn: () => listDeals(1, 100),
    staleTime: 20_000,
  });
  const loading = favoritesQuery.isPending || dealsQuery.isPending;
  const error = favoritesQuery.isError || dealsQuery.isError;
  const favoriteRows = useMemo(
    () => favoritesQuery.data?.favorites ?? [],
    [favoritesQuery.data?.favorites],
  );
  const dealRows = useMemo(
    () => dealsQuery.data?.deals ?? [],
    [dealsQuery.data?.deals],
  );
  const industries = useMemo(
    () =>
      distribution(
        favoriteRows.map((item) => item.industry),
        "Industry not disclosed",
      ),
    [favoriteRows],
  );
  const locations = useMemo(
    () =>
      distribution(
        favoriteRows.map((item) => item.location),
        "Location not disclosed",
      ),
    [favoriteRows],
  );
  const pricesByCurrency = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const favorite of favoriteRows) {
      if (favorite.askingPrice === null) continue;
      const value = Number(favorite.askingPrice);
      if (!Number.isFinite(value)) continue;
      grouped.set(favorite.currency, [
        ...(grouped.get(favorite.currency) ?? []),
        value,
      ]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, values]) => ({
        currency,
        count: values.length,
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        rows: priceBandRows(values, currency),
      }));
  }, [favoriteRows]);
  const dealStatuses = useMemo(
    () =>
      distribution(
        dealRows.map((deal) => deal.status),
        "Status unavailable",
      ),
    [dealRows],
  );

  return (
    <>
      <WorkspacePageHeader
        description="A current snapshot of your saved opportunity mix and acquisition pipeline. These are portfolio distributions, not historical trends."
        eyebrow="Buyer workspace · Insights"
        title="Buyer analytics"
      />
      {loading ? <WorkspaceSkeleton rows={2} /> : null}
      {error ? (
        <ErrorState
          description="Your buyer analytics could not be loaded."
          onRetry={() => {
            void favoritesQuery.refetch();
            void dealsQuery.refetch();
          }}
          title="Analytics unavailable"
        />
      ) : null}
      {!loading && !error ? (
        <div className="space-y-5">
          <p className="rounded-lg border border-line bg-white px-4 py-3 text-xs leading-5 text-ink-soft">
            Snapshot based on up to {favoriteRows.length} most recently saved
            published businesses and {dealRows.length} most recently updated
            deals. {favoritesQuery.data?.pagination.total ?? 0} saved listings
            and {dealsQuery.data?.pagination.total ?? 0} deals exist across the
            full paginated records. No daily/monthly history or currency
            conversion is available.
          </p>
          <div className="grid gap-5 xl:grid-cols-2">
            <DistributionChart
              description="Count by the listing’s reported industry; undisclosed values are kept visible."
              rows={industries}
              title="Saved businesses by industry"
            />
            <DistributionChart
              description="Count by the location stated on the public listing."
              rows={locations}
              title="Saved businesses by location"
            />
          </div>
          <SectionCard>
            <SectionHeading
              description="Asking-price bands are calculated separately within each currency. Listings without a disclosed asking price are excluded from this view."
              title="Asking-price distribution"
            />
            {pricesByCurrency.length ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {pricesByCurrency.map((group) => (
                  <div
                    className="rounded-xl border border-line p-4"
                    key={group.currency}
                  >
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-navy-950">
                          {group.currency}
                        </h3>
                        <p className="mt-1 text-[0.68rem] text-ink-soft">
                          {group.count} disclosed asking price
                          {group.count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <p className="text-right text-xs text-ink-soft">
                        Mean
                        <br />
                        <span className="font-semibold text-navy-950">
                          {currencyFormat(group.average, group.currency)}
                        </span>
                      </p>
                    </div>
                    <div
                      aria-label={`${group.currency} asking-price bands`}
                      className="h-56"
                      role="img"
                    >
                      <ResponsiveContainer height="100%" width="100%">
                        <BarChart
                          data={group.rows}
                          margin={{ top: 8, right: 4, bottom: 8, left: -18 }}
                        >
                          <CartesianGrid
                            stroke="#e7ece8"
                            strokeDasharray="3 4"
                            vertical={false}
                          />
                          <XAxis
                            axisLine={false}
                            dataKey="label"
                            interval={0}
                            tick={{ fill: "#607069", fontSize: 9 }}
                            tickLine={false}
                            tickMargin={8}
                          />
                          <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tick={{ fill: "#87948d", fontSize: 10 }}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              border: "1px solid #e3e9e4",
                              borderRadius: 10,
                              fontSize: 12,
                            }}
                          />
                          <Bar
                            dataKey="count"
                            fill="#10B981"
                            maxBarSize={44}
                            radius={[5, 5, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <WorkspaceEmpty
                description="None of the currently loaded saved listings disclose an asking price."
                title="No asking prices to compare"
              />
            )}
          </SectionCard>
          <DistributionChart
            description="Current deal status counts from the most recently updated participant deals. This is a current snapshot, not monthly deal flow."
            rows={dealStatuses}
            title="Deal pipeline by status"
          />
          {favoriteRows.length === 0 && dealRows.length === 0 ? (
            <p className="text-center text-xs text-ink-faint">
              Save a business or start an acquisition to build your portfolio
              snapshot.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
