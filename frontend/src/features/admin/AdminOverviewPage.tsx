import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Building2, Flag, Users } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  MetricCard,
  SectionCard,
  SectionHeading,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { getAdminDashboard, listAdminListings } from "./api";

const colors = [
  "#0B1F36",
  "#10B981",
  "#A7C6B4",
  "#94A3B8",
  "#F59E0B",
  "#EF4444",
];
const dateText = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: getAdminDashboard,
    staleTime: 45_000,
  });
  const listingSample = useQuery({
    queryKey: ["admin", "listing-sample", 1, 100],
    queryFn: () => listAdminListings({ page: 1, limit: 100, status: "all" }),
    staleTime: 45_000,
  });
  const data = query.data;
  const industryData = useMemo(
    () =>
      groupLabels(
        listingSample.data?.listings.map(
          (listing) => listing.industry ?? "Not specified",
        ) ?? [],
      ),
    [listingSample.data?.listings],
  );
  const locationData = useMemo(
    () =>
      groupLabels(
        listingSample.data?.listings.map(
          (listing) => listing.location ?? "Not specified",
        ) ?? [],
      ),
    [listingSample.data?.listings],
  );
  const roles = useMemo(
    () =>
      data
        ? [
            { name: "Buyers", value: data.users.buyers },
            { name: "Sellers", value: data.users.sellers },
            {
              name: "Administrators",
              value: Math.max(
                0,
                data.users.total - data.users.buyers - data.users.sellers,
              ),
            },
          ].filter((item) => item.value > 0)
        : [],
    [data],
  );
  const listingStatuses = useMemo(
    () =>
      data
        ? [
            { name: "Published", value: data.listings.published },
            { name: "Pending", value: data.listings.pending },
            { name: "Rejected", value: data.listings.rejected },
            { name: "Suspended", value: data.listings.suspended },
            {
              name: "Other statuses",
              value: Math.max(
                0,
                data.listings.total -
                  data.listings.published -
                  data.listings.pending -
                  data.listings.rejected -
                  data.listings.suspended,
              ),
            },
          ].filter((item) => item.value > 0)
        : [],
    [data],
  );

  return (
    <>
      <WorkspacePageHeader
        description="A current operational snapshot for account health, listing review and reported issues."
        eyebrow="Platform operations"
        title="Operations overview"
        action={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-semibold text-navy-950 transition hover:border-emerald-700/30 hover:bg-mist"
            to="/admin/audit"
          >
            <Activity aria-hidden="true" size={16} /> Audit history
          </Link>
        }
      />
      {query.isPending ? <WorkspaceSkeleton rows={4} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error ?? listingSample.error}
          description="The admin dashboard could not be loaded."
          onRetry={() => void query.refetch()}
          title="Operations snapshot unavailable"
        />
      ) : null}
      {data ? (
        <div className="space-y-7">
          <section
            aria-label="Platform totals"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              detail={`${data.users.active} active · ${data.users.suspended} suspended`}
              href="/admin/users"
              icon={<Users size={18} />}
              label="Users"
              value={data.users.total}
            />
            <MetricCard
              detail={`${data.listings.published} published`}
              href="/admin/moderation"
              icon={<Building2 size={18} />}
              label="Listings"
              value={data.listings.total}
            />
            <MetricCard
              detail="Awaiting administrative review"
              href="/admin/moderation?status=pending"
              icon={<Building2 size={18} />}
              label="Pending listings"
              value={data.listings.pending}
            />
            <MetricCard
              detail={`${data.reports.recentlyResolved} resolved in the last 7 days`}
              href="/admin/reports"
              icon={<Flag size={18} />}
              label="Open reports"
              value={data.reports.open}
            />
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard>
              <SectionHeading
                description="Current account totals by role from the admin dashboard endpoint."
                title="User distribution"
              />
              {roles.length ? (
                <div
                  className="h-72 w-full"
                  role="img"
                  aria-label="Donut chart of user counts by role"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie
                        data={roles}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={68}
                        outerRadius={102}
                        paddingAngle={3}
                      >
                        {roles.map((entry, index) => (
                          <Cell
                            fill={colors[index % colors.length]}
                            key={entry.name}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <WorkspaceEmpty
                  title="No user records"
                  description="Role distribution will appear when accounts exist."
                />
              )}
            </SectionCard>
            <SectionCard>
              <SectionHeading
                description="Top reported industries across the 100 most recently created listings."
                title="Listings by industry"
              />
              <SampleDistribution
                data={industryData}
                error={listingSample.isError}
                loading={listingSample.isPending}
                retry={() => void listingSample.refetch()}
              />
            </SectionCard>
            <SectionCard>
              <SectionHeading
                description="Top reported locations across the 100 most recently created listings."
                title="Listings by location"
              />
              <SampleDistribution
                data={locationData}
                error={listingSample.isError}
                loading={listingSample.isPending}
                retry={() => void listingSample.refetch()}
              />
            </SectionCard>
            <SectionCard>
              <SectionHeading
                description="A current snapshot. Drafts and archived listings are grouped as other statuses by the endpoint totals."
                title="Listing status distribution"
              />
              {listingStatuses.length ? (
                <div
                  className="h-72 w-full"
                  role="img"
                  aria-label="Donut chart of listing counts by status"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie
                        data={listingStatuses}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={68}
                        outerRadius={102}
                        paddingAngle={3}
                      >
                        {listingStatuses.map((entry, index) => (
                          <Cell
                            fill={colors[(index + 1) % colors.length]}
                            key={entry.name}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <WorkspaceEmpty
                  title="No listing records"
                  description="Listing status distribution will appear when listings exist."
                />
              )}
            </SectionCard>
            <SectionCard className="xl:col-span-2">
              <SectionHeading
                action={
                  <Link
                    className="text-xs font-semibold text-emerald-800"
                    to="/admin/audit"
                  >
                    View all activity
                  </Link>
                }
                description="Latest administrative actions, ordered by creation time."
                title="Recent administrative activity"
              />
              {data.recentActions.length ? (
                <div className="divide-y divide-line">
                  {data.recentActions.map((action) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                      key={action.id}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-950">
                          {action.action
                            .replaceAll(".", " ")
                            .replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {action.targetType} #{action.targetId} · actor #
                          {action.actorId ?? "system"}
                        </p>
                      </div>
                      <time
                        className="text-xs text-ink-soft"
                        dateTime={new Date(action.createdAt).toISOString()}
                      >
                        {dateText(action.createdAt)}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty
                  title="No administrative activity yet"
                  description="Audited platform actions will appear here."
                />
              )}
            </SectionCard>
          </div>
          <p className="text-xs leading-5 text-ink-soft">
            Deal and offer totals, registration trends, and historical activity
            analytics are not exposed by the current admin API. No time-series
            data is inferred from these totals.
          </p>
        </div>
      ) : null}
    </>
  );
}

function groupLabels(values: string[]) {
  const grouped = new Map<string, number>();
  for (const value of values) grouped.set(value, (grouped.get(value) ?? 0) + 1);
  return [...grouped.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function SampleDistribution({
  data,
  loading,
  error,
  retry,
}: {
  data: Array<{ name: string; count: number }>;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <div
        aria-label="Loading listing distribution"
        className="mt-4 h-64 animate-pulse rounded-xl bg-mist"
        role="status"
      />
    );
  if (error)
    return (
      <div className="mt-4 rounded-lg bg-rose-50 p-4 text-xs text-rose-900">
        Listing distribution unavailable.{" "}
        <button
          className="font-semibold underline"
          onClick={retry}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  if (!data.length)
    return (
      <WorkspaceEmpty
        title="No listing records"
        description="The distribution will appear when listings are available."
      />
    );
  return (
    <div
      aria-label="Listing counts by category in the latest sample"
      className="mt-4 h-64 w-full"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
        >
          <CartesianGrid
            stroke="#E8ECE9"
            strokeDasharray="3 3"
            horizontal={false}
          />
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="name"
            tick={{ fill: "#526273", fontSize: 10 }}
            tickLine={false}
            type="category"
            width={96}
          />
          <Tooltip />
          <Bar
            dataKey="count"
            fill="#10B981"
            name="Listings"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
