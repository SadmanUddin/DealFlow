import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
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
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listDeals, listOffers } from "@/features/deals/api";
import { listInquiries, listMyListings } from "./api";

const palette = [
  "#0B1F36",
  "#10B981",
  "#64748B",
  "#A7C6B4",
  "#CBD5E1",
  "#047857",
];
const counts = (values: string[]) =>
  [
    ...values
      .reduce(
        (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
        new Map<string, number>(),
      )
      .entries(),
  ]
    .map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

export function SellerAnalyticsPage() {
  const listingsQuery = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    staleTime: 45_000,
  });
  const inquiriesQuery = useQuery({
    queryKey: ["seller", "inquiries", 1, 100],
    queryFn: () => listInquiries(1, 100),
    staleTime: 45_000,
  });
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", 1, 20],
    queryFn: () => listDeals(1, 20),
    staleTime: 45_000,
  });
  const deals = useMemo(
    () => dealsQuery.data?.deals ?? [],
    [dealsQuery.data?.deals],
  );
  const offerQueries = useQueries({
    queries: deals.map((deal) => ({
      queryKey: ["deals", deal.id, "offers"],
      queryFn: () => listOffers(deal.id),
      staleTime: 20_000,
    })),
  });
  const listings = useMemo(
    () => listingsQuery.data?.listings ?? [],
    [listingsQuery.data?.listings],
  );
  const inquiries = useMemo(
    () => inquiriesQuery.data?.conversations ?? [],
    [inquiriesQuery.data?.conversations],
  );
  const offers = offerQueries.flatMap((query) => query.data?.offers ?? []);
  const listingStatuses = useMemo(
    () => counts(listings.map((item) => item.status)),
    [listings],
  );
  const inquiryStatuses = useMemo(
    () => counts(inquiries.map((item) => item.status)),
    [inquiries],
  );
  const dealStatuses = useMemo(
    () => counts(deals.map((item) => item.status)),
    [deals],
  );
  const offerStatuses = useMemo(
    () => counts(offers.map((item) => item.status)),
    [offers],
  );
  const interestByListing = useMemo(() => {
    const grouped = new Map<number, { name: string; inquiries: number }>();
    for (const inquiry of inquiries) {
      const current = grouped.get(inquiry.listingId) ?? {
        name: inquiry.listingTitle,
        inquiries: 0,
      };
      current.inquiries += 1;
      grouped.set(inquiry.listingId, current);
    }
    return [...grouped.values()]
      .sort((a, b) => b.inquiries - a.inquiries || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [inquiries]);
  const pending =
    listingsQuery.isPending ||
    inquiriesQuery.isPending ||
    dealsQuery.isPending ||
    offerQueries.some((query) => query.isPending);
  const failed =
    listingsQuery.isError ||
    inquiriesQuery.isError ||
    dealsQuery.isError ||
    offerQueries.some((query) => query.isError);
  return (
    <>
      <WorkspacePageHeader
        description="Review the current status of your listings, inquiries, and offers."
        eyebrow="Seller workspace · Insights"
        title="Seller analytics"
      />
      {pending ? <WorkspaceSkeleton rows={3} /> : null}
      {failed ? (
        <ErrorState
          error={
            listingsQuery.error ?? inquiriesQuery.error ?? dealsQuery.error
          }
          description="Some seller analytics could not be loaded."
          onRetry={() => {
            void listingsQuery.refetch();
            void inquiriesQuery.refetch();
            void dealsQuery.refetch();
            offerQueries.forEach((query) => void query.refetch());
          }}
          title="Analytics unavailable"
        />
      ) : null}
      {!pending && !failed ? (
        <div className="space-y-5">
          <p className="rounded-xl border border-line bg-white px-4 py-3 text-xs leading-5 text-ink-soft">
            Charts cover your latest 100 listings, 100 inquiries, and offers
            across the latest 20 deals.
          </p>
          <div className="grid gap-5 xl:grid-cols-2">
            <Distribution
              title="Listing portfolio by status"
              description={`${listings.length} of ${listingsQuery.data?.pagination.total ?? listings.length} latest listings`}
              data={listingStatuses}
            />
            <Distribution
              title="Buyer inquiries by status"
              description={`${inquiries.length} of ${inquiriesQuery.data?.pagination.total ?? inquiries.length} latest conversations`}
              data={inquiryStatuses}
            />
            <Distribution
              title="Offers by status"
              description={`Offers attached to ${deals.length} recent deals`}
              data={offerStatuses}
            />
            <Distribution
              title="Recent deal pipeline"
              description={`${deals.length} of ${dealsQuery.data?.pagination.total ?? deals.length} most recently updated deals`}
              data={dealStatuses}
            />
            <SectionCard className="xl:col-span-2">
              <SectionHeading
                description="Counts buyer conversations, not listing views or impressions."
                title="Buyer inquiries by business"
              />
              {interestByListing.length ? (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={interestByListing}
                      layout="vertical"
                      margin={{ left: 12, right: 18, top: 8, bottom: 8 }}
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
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        type="category"
                        width={145}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="inquiries"
                        fill="#10B981"
                        name="Buyer inquiries"
                        radius={[0, 5, 5, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <WorkspaceEmpty
                  description="Buyer interest by listing appears after conversations exist."
                  title="No inquiry data"
                />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Distribution({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: { name: string; value: number }[];
}) {
  return (
    <SectionCard>
      <SectionHeading description={description} title={title} />
      {data.length ? (
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="48%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {data.map((_item, index) => (
                  <Cell
                    fill={palette[index % palette.length]}
                    key={`slice-${index}`}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                formatter={(value) => (
                  <span className="text-xs capitalize text-ink-soft">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <WorkspaceEmpty
          description="This chart will appear once there is activity to show."
          title="No data available"
        />
      )}
    </SectionCard>
  );
}
