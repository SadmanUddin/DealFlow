import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  MetricCard,
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { useAuth } from "@/features/auth/useAuth";
import { listMyListings } from "./api";
import {
  analyticsRanges,
  fetchSellerAnalytics,
  type AnalyticsRange,
  type SellerAnalytics,
} from "./analytics-api";

const metrics = [
  [
    "views",
    "Listing views",
    "Eligible signed-in listing detail visits, once per account per listing per UTC day.",
  ],
  [
    "inquiries",
    "Inquiries received",
    "Buyer conversations started during this period.",
  ],
  [
    "offers",
    "Offers received",
    "Buyer-authored offers and counteroffers created during this period.",
  ],
  [
    "accepted",
    "Accepted offers",
    "Buyer or seller offers accepted during this period.",
  ],
  [
    "completed",
    "Completed acquisitions",
    "Deals confirmed by both parties during this period.",
  ],
] as const;
const count = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});
const formatDate = (value: string) => dateFormat.format(new Date(value));
const display = (value: number | null) =>
  value === null ? "N/A" : count.format(value);
const rangeLabel = (range: AnalyticsRange) =>
  range === "all" ? "All time" : `Last ${range} days`;

export function SellerAnalyticsPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const filter = params.get("range");
  const range = analyticsRanges.find((option) => option === filter) ?? "30";
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["seller", "analytics", user?.id, id ?? "overview", range],
    queryFn: () => fetchSellerAnalytics(range, id ? [Number(id)] : []),
    staleTime: 60_000,
  });
  const [comparisonPage, setComparisonPage] = useState(1);
  const [selection, setSelection] = useState<ListingSelection>([]);
  const analytics = query.data;
  const listing = analytics?.listings[0];

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Seller workspace"
        title={
          id ? (listing?.title ?? "Listing analytics") : "Seller analytics"
        }
        description={
          id
            ? "Review performance for this business."
            : "Track listing traffic, buyer engagement, and confirmed acquisitions."
        }
        action={
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Date range
            <select
              className="rounded-lg border border-line bg-white p-2"
              value={range}
              onChange={(event) => setParams({ range: event.target.value })}
            >
              {analyticsRanges.map((option) => (
                <option key={option} value={option}>
                  {rangeLabel(option)}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {id && (
        <Link
          className="mb-5 inline-block font-semibold text-emerald-800 underline"
          to={`/seller/analytics?range=${range}`}
        >
          All seller analytics
        </Link>
      )}
      {query.isPending && <WorkspaceSkeleton rows={3} />}
      {query.isError && (
        <ErrorState
          error={query.error}
          title="Analytics unavailable"
          onRetry={() => void query.refetch()}
        />
      )}
      {analytics && !query.isError && (
        <div className="min-w-0 space-y-5">
          {listing && (
            <SectionCard>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge status={listing.status} />
                <span>
                  Publication date{" "}
                  {listing.publishedAt
                    ? formatDate(listing.publishedAt)
                    : "unavailable"}
                </span>
                <span>
                  {listing.completedAt
                    ? `Acquisition completed ${formatDate(listing.completedAt)}`
                    : "No confirmed acquisition"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="All recorded views"
                  value={display(analytics.listingViews?.total ?? null)}
                />
                <MetricCard
                  label="Views in the last 7 UTC days"
                  value={display(analytics.listingViews?.recent ?? null)}
                />
              </div>
            </SectionCard>
          )}
          <p className="text-sm leading-relaxed text-ink-soft">
            {analytics.window.from
              ? `${formatDate(analytics.window.from)} to ${formatDate(analytics.window.today)} (UTC).`
              : "All available activity, grouped by UTC month."}{" "}
            {analytics.window.coverage
              ? `View analytics are available from ${formatDate(analytics.window.coverage)} (UTC). The first day may be partial. Counts cover eligible signed-in visits with sharing enabled.`
              : "View history is unavailable. View analytics are available from the date tracking is enabled."}
          </p>
          {analytics.listingCount === 0 && (
            <WorkspaceEmpty
              title="No listings yet"
              description="Add a business to start building your performance history."
            />
          )}
          <section
            aria-label="Performance summary"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {metrics.map(([key, label, detail]) => (
              <MetricCard
                key={key}
                label={label}
                detail={detail}
                value={display(analytics.totals[key])}
              />
            ))}
            <MetricCard
              label="Buyer-offer acceptance rate"
              detail="Share of buyer offers created in this period that have been accepted as of now."
              value={
                analytics.offerAcceptanceRate === null
                  ? "N/A"
                  : `${analytics.offerAcceptanceRate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
              }
            />
          </section>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <TrendChart data={analytics} views />
            <TrendChart data={analytics} />
          </div>
          <ActivityFunnel data={analytics} />
          <PipelineSnapshot data={analytics} range={range} />
          <SectionCard>
            <SectionHeading
              title="Performance insights"
              description="Insights flag fewer than 2 inquiries per 100 recorded views when the period has tracking coverage and at least 100 views. They also flag 5 or more inquiries with zero buyer offers in the same period."
            />
            {analytics.insights.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {analytics.insights.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="font-semibold text-emerald-800 underline"
                      to={`/seller/analytics/listings/${item.id}?range=${range}`}
                    >
                      {item.title}
                    </Link>{" "}
                    {item.rule === "few_inquiries"
                      ? `received ${display(item.views)} recorded views and ${count.format(item.inquiries)} inquiries in this period.`
                      : `received ${count.format(item.inquiries)} inquiries and no buyer offers in this period.`}
                  </li>
                ))}
              </ul>
            ) : (
              <WorkspaceEmpty
                title="No insights for this period"
                description="Insights appear when a listing meets an activity threshold."
              />
            )}
          </SectionCard>
          {!id && (
            <ListingComparison
              range={range}
              accountId={user?.id}
              page={comparisonPage}
              setPage={setComparisonPage}
              selection={selection}
              setSelection={setSelection}
            />
          )}
        </div>
      )}
    </>
  );
}

function TrendChart({
  data,
  views = false,
}: {
  data: SellerAnalytics;
  views?: boolean;
}) {
  const title = views ? "Listing views over time" : "Buyer engagement";
  const noData = views
    ? !data.totals.views
    : !data.totals.inquiries && !data.totals.offers;
  const tick = new Intl.DateTimeFormat(undefined, {
    month: "short",
    ...(data.window.interval === "month"
      ? { year: "2-digit" }
      : { day: "numeric" }),
    timeZone: "UTC",
  });
  const tooltipDate = (value: unknown) =>
    typeof value === "string" ? tick.format(new Date(value)) : "";
  const axes = (
    <>
      <CartesianGrid stroke="#E8ECE9" strokeDasharray="3 3" />
      <XAxis
        dataKey="date"
        tickFormatter={tooltipDate}
        tick={{ fontSize: 11 }}
        minTickGap={24}
      />
      <YAxis allowDecimals={false} width={44} tick={{ fontSize: 11 }} />
      <Tooltip labelFormatter={tooltipDate} />
    </>
  );
  return (
    <SectionCard className="min-w-0">
      <SectionHeading
        title={title}
        description={
          views
            ? "Gaps show periods before view tracking began."
            : "New inquiries and buyer offers."
        }
      />
      {noData ? (
        <WorkspaceEmpty
          title={
            views
              ? data.totals.views === null
                ? "View history unavailable"
                : "No recorded views"
              : "No buyer engagement"
          }
          description={
            views
              ? "Eligible views appear here once recorded within the selected period."
              : "Inquiries and offers appear here as buyers engage with your listings."
          }
        />
      ) : (
        <div className="mt-4 h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {views ? (
              <AreaChart data={data.trends} title={title}>
                {axes}
                <Area
                  dataKey="views"
                  name="Listing views"
                  type="monotone"
                  stroke="#047857"
                  fill="#A7C6B4"
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={data.trends} title={title}>
                {axes}
                <Legend />
                <Line
                  dataKey="inquiries"
                  name="Inquiries"
                  stroke="#047857"
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="offers"
                  name="Buyer offers"
                  stroke="#334E78"
                  strokeDasharray="5 3"
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

function ActivityFunnel({ data }: { data: SellerAnalytics }) {
  const max = Math.max(1, ...metrics.map(([key]) => data.totals[key] ?? 0));
  return (
    <SectionCard>
      <SectionHeading
        title="Acquisition activity funnel"
        description="Each stage is counted independently. These totals describe activity across your listings and cannot establish an individual buyer journey."
      />
      <ol className="mt-4 space-y-3">
        {metrics.map(([key, label, definition]) => (
          <li key={key}>
            <div
              className="flex justify-between gap-2 text-sm font-medium"
              title={definition}
            >
              <span>{label}</span>
              <span>{display(data.totals[key])}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2.5 rounded bg-mist">
              <div
                className="h-full rounded bg-emerald-700"
                style={{ width: `${(100 * (data.totals[key] ?? 0)) / max}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function PipelineSnapshot({
  data,
  range,
}: {
  data: SellerAnalytics;
  range: AnalyticsRange;
}) {
  return (
    <SectionCard>
      <details>
        <summary className="w-fit cursor-pointer text-lg font-semibold text-navy-950">
          Listing and pipeline status
        </summary>
        <p className="my-3 text-sm text-ink-soft">
          Current listing, inquiry, offer and deal statuses across all dates.
          Offer statuses include both sides of negotiations.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["listings", "inquiries", "offers", "deals"].map((group) => (
            <div
              className="min-w-0 rounded-xl border border-line p-3"
              key={group}
            >
              <h3 className="font-semibold capitalize">{group}</h3>
              <dl className="mt-2 space-y-1 text-sm">
                {Object.entries(data.statusCounts[group] ?? {})
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([status, total]) => (
                    <div className="flex justify-between gap-2" key={status}>
                      <dt className="capitalize">
                        {status.replaceAll("_", " ")}
                      </dt>
                      <dd>{display(total)}</dd>
                    </div>
                  ))}
              </dl>
              {!data.statusCounts[group] && (
                <p className="mt-2 text-sm text-ink-soft">No activity yet</p>
              )}
            </div>
          ))}
        </div>
        <h3 className="mt-4 font-semibold">
          Top listings by inquiries in this period
        </h3>
        {data.inquiriesByListing.length ? (
          <ol className="mt-2 space-y-2 text-sm">
            {data.inquiriesByListing.map((row) => (
              <li
                className="flex flex-wrap justify-between gap-x-2"
                key={row.id}
              >
                <Link
                  className="break-words font-semibold text-emerald-800 underline"
                  to={`/seller/analytics/listings/${row.id}?range=${range}`}
                >
                  {row.title}
                </Link>
                <span>
                  {display(row.count)}{" "}
                  {row.count === 1 ? "inquiry" : "inquiries"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            No inquiries in this period
          </p>
        )}
      </details>
    </SectionCard>
  );
}

function publicationAge(publishedAt: string, today: string) {
  const publishedDay = publishedAt.slice(0, 10);
  return Math.max(
    0,
    (Date.parse(today) - Date.parse(publishedDay)) / 86_400_000,
  );
}

type ListingSelection = { id: number; title: string }[];

function ListingComparison({
  range,
  accountId,
  page,
  setPage,
  selection,
  setSelection,
}: {
  range: AnalyticsRange;
  accountId?: number;
  page: number;
  setPage: (page: number) => void;
  selection: ListingSelection;
  setSelection: Dispatch<SetStateAction<ListingSelection>>;
}) {
  const ids = selection.map((item) => item.id).sort((a, b) => a - b);
  const catalog = useQuery({
    queryKey: ["seller", "listings", page, 10, accountId],
    queryFn: () => listMyListings(page, 10),
    staleTime: 60_000,
  });
  const comparison = useQuery({
    queryKey: ["seller", "analytics", "compare", accountId, range, ids],
    queryFn: () => fetchSellerAnalytics(range, ids),
    enabled: ids.length >= 2,
    staleTime: 60_000,
  });
  const selected = (id: number) => selection.some((item) => item.id === id);

  return (
    <SectionCard>
      <SectionHeading
        title="Compare listings"
        description="Select two or three businesses. Publication age is measured from the latest publication date, including any time the listing was unavailable."
      />
      {!!selection.length && (
        <div
          className="mt-3 flex flex-wrap gap-2"
          aria-label="Selected listings"
        >
          {selection.map((item) => (
            <button
              className="max-w-full break-words rounded-lg border border-line px-2 py-1 text-sm"
              key={item.id}
              type="button"
              onClick={() =>
                setSelection((current) =>
                  current.filter((row) => row.id !== item.id),
                )
              }
              aria-label={`Remove ${item.title} (#${item.id})`}
            >
              {item.title} (#{item.id}) ×
            </button>
          ))}
        </div>
      )}
      {catalog.isPending && <WorkspaceSkeleton rows={2} />}
      {catalog.isError && (
        <ErrorState
          error={catalog.error}
          title="Listings unavailable"
          onRetry={() => void catalog.refetch()}
        />
      )}
      {catalog.data && (
        <>
          <fieldset className="mt-4 min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-semibold">
              Businesses to compare
            </legend>
            {!catalog.data.listings.length && (
              <p className="text-sm text-ink-soft">No listings to compare.</p>
            )}
            {catalog.data.listings.map(({ id, title: name }) => (
              <div
                key={id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
              >
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected(id)}
                    disabled={ids.length === 3 && !selected(id)}
                    onChange={(event) =>
                      setSelection(
                        event.target.checked
                          ? [...selection, { id, title: name }]
                          : selection.filter((item) => item.id !== id),
                      )
                    }
                  />
                  <span className="min-w-0 break-words">
                    {name} (#{id})
                  </span>
                </label>
                <Link
                  className="text-sm font-semibold text-emerald-800 underline"
                  to={`/seller/analytics/listings/${id}?range=${range}`}
                >
                  View analytics<span className="sr-only"> for {name}</span>
                </Link>
              </div>
            ))}
          </fieldset>
          {catalog.data.pagination.totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <button
                className="rounded border border-line px-2 py-1 disabled:opacity-50"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous page
              </button>
              <span>
                Page {page} of {catalog.data.pagination.totalPages}
              </span>
              <button
                className="rounded border border-line px-2 py-1 disabled:opacity-50"
                type="button"
                disabled={page >= catalog.data.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
        {ids.length} of 3 listings selected
      </p>
      {ids.length >= 2 && comparison.isPending && (
        <WorkspaceSkeleton rows={2} />
      )}
      {comparison.isError && (
        <ErrorState
          error={comparison.error}
          title="Comparison unavailable"
          onRetry={() => void comparison.refetch()}
        />
      )}
      {comparison.data && (
        <section
          aria-label="Listing comparison results"
          className="mt-4 grid gap-3 lg:grid-cols-3"
        >
          {comparison.data.listings.map((listing) => (
            <div
              className="min-w-0 rounded-xl border border-line p-4"
              key={listing.id}
            >
              <h3 className="mb-2 break-words font-semibold">
                {listing.title} (#{listing.id})
              </h3>
              <StatusBadge status={listing.status} />
              <p className="my-2 text-xs text-ink-soft">
                {listing.publishedAt
                  ? `Published ${formatDate(listing.publishedAt)} · ${publicationAge(listing.publishedAt, comparison.data.window.today)} days ago`
                  : "Publication date unavailable"}
              </p>
              <dl className="space-y-2 text-sm">
                {metrics.map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt>{label}</dt>
                    <dd>{display(listing.metrics[key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      )}
    </SectionCard>
  );
}
