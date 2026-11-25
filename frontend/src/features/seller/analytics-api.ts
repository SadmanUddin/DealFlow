import { z } from "zod";
import { getValidated } from "@/features/workspace/api-core";

export const analyticsRanges = ["7", "30", "90", "all"] as const;
export type AnalyticsRange = (typeof analyticsRanges)[number];
const count = z.number().int().nonnegative();
const metrics = z.object({
  views: count.nullable(),
  inquiries: count,
  offers: count,
  accepted: count,
  completed: count,
});
const analytics = z.object({
  window: z.object({
    from: z.string().nullable(),
    today: z.string(),
    coverage: z.string().nullable(),
    asOf: z.string(),
    interval: z.enum(["day", "month"]),
  }),
  totals: metrics,
  trends: z.array(
    metrics
      .pick({ views: true, inquiries: true, offers: true })
      .extend({ date: z.string() }),
  ),
  listingCount: count,
  pendingOffers: count,
  offerAcceptanceRate: z.number().nullable(),
  listings: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      status: z.string(),
      publishedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      metrics,
    }),
  ),
  listingViews: z.object({ total: count, recent: count }).nullable(),
  statusCounts: z.record(z.string(), z.record(z.string(), count)),
  inquiriesByListing: z.array(
    z.object({ id: z.number(), title: z.string(), count }),
  ),
  insights: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      views: count.nullable(),
      inquiries: count,
      rule: z.enum(["few_inquiries", "no_offers"]),
    }),
  ),
});

export type SellerAnalytics = z.infer<typeof analytics>;

export async function fetchSellerAnalytics(
  range: AnalyticsRange,
  ids: number[] = [],
) {
  const path =
    ids.length > 1
      ? "/comparison"
      : ids.length === 1
        ? `/listings/${ids[0]}`
        : "/overview";
  const { analytics: data } = await getValidated(
    `/seller/analytics${path}`,
    z.object({ analytics }),
    {
      range,
      ...(ids.length > 1 ? { ids: ids.join(",") } : {}),
    },
  );
  return data;
}
