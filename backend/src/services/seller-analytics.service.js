import { sql } from 'drizzle-orm';
import { db } from '#config/database.js';

const dayMs = 86_400_000;
const day = date => date.toISOString().slice(0, 10);

function analyticsWindow(range, trackingSince, now = new Date()) {
  const today = day(now);
  const from =
    range === 'all'
      ? null
      : day(new Date(Date.parse(today) - (Number(range) - 1) * dayMs));
  const coverage =
    trackingSince && Date.parse(trackingSince) <= now.getTime()
      ? trackingSince
      : null;
  return {
    from,
    today,
    coverage,
    asOf: now.toISOString(),
    interval: range === 'all' ? 'month' : 'day',
  };
}

function acceptanceRate(accepted, received) {
  return received ? (100 * accepted) / received : null;
}

export async function getSellerAnalytics(
  sellerId,
  range,
  ids,
  trackingSince,
  now
) {
  const window = analyticsWindow(range, trackingSince, now);
  const { from, today, asOf, coverage, interval } = window;
  const viewStart = coverage?.slice(0, 10) ?? null;
  const recent = day(new Date(Date.parse(today) - 6 * dayMs));
  const listingFilter = ids.length
    ? sql`AND id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
    : sql``;

  const {
    rows: [result],
  } = await db.execute(sql`
    WITH owned AS (
      SELECT id, title, status, published_at
      FROM business_listings
      WHERE seller_id = ${sellerId}
        ${listingFilter}
    ), seller_deals AS (
      SELECT d.id, d.listing_id, d.buyer_id, d.status, d.completed_at FROM deals d JOIN owned l ON l.id = d.listing_id
      WHERE d.seller_id = ${sellerId}
    ), seller_inquiries AS (
      SELECT c.listing_id, c.status, c.created_at
      FROM owned l JOIN conversations c ON c.listing_id = l.id
      WHERE c.seller_id = ${sellerId}
    ), offers AS (
      SELECT d.listing_id, o.created_at, o.responded_at, o.status, o.created_by = d.buyer_id AS from_buyer
      FROM seller_deals d JOIN deal_offers o ON o.deal_id = d.id
    ), activity AS (
      SELECT v.listing_id, v.viewed_on AS day, 'views' AS metric
      FROM owned l JOIN listing_view_events v ON v.listing_id = l.id
      WHERE v.viewed_on BETWEEN GREATEST(${viewStart}::date, ${from}::date) AND ${today}::date
        AND ${viewStart}::date IS NOT NULL
      UNION ALL
      SELECT c.listing_id, (c.created_at AT TIME ZONE 'UTC')::date, 'inquiries'
      FROM seller_inquiries c
      WHERE c.created_at <= ${asOf}::timestamptz
        AND c.created_at >= COALESCE(${from}::date::timestamp AT TIME ZONE 'UTC', '-infinity')
      UNION ALL
      SELECT listing_id, (created_at AT TIME ZONE 'UTC')::date, 'offers' FROM offers
      WHERE from_buyer AND created_at <= ${asOf}::timestamptz
        AND created_at >= COALESCE(${from}::date::timestamp AT TIME ZONE 'UTC', '-infinity')
      UNION ALL
      SELECT listing_id, (responded_at AT TIME ZONE 'UTC')::date, 'accepted' FROM offers
      WHERE status = 'accepted' AND responded_at <= ${asOf}::timestamptz
        AND responded_at >= COALESCE(${from}::date::timestamp AT TIME ZONE 'UTC', '-infinity')
      UNION ALL
      SELECT listing_id, (completed_at AT TIME ZONE 'UTC')::date, 'completed' FROM seller_deals
      WHERE completed_at <= ${asOf}::timestamptz
        AND completed_at >= COALESCE(${from}::date::timestamp AT TIME ZONE 'UTC', '-infinity')
    ), counts AS (
      SELECT listing_id, metric, date_trunc(${interval}, day::timestamp)::date AS bucket, count(*) AS total
      FROM activity GROUP BY 1, 2, 3
    ), totals AS (
      SELECT listing_id, metric, sum(total) AS count FROM counts GROUP BY 1, 2
    ), by_listing AS (
      SELECT listing_id, jsonb_object_agg(metric, count) AS metrics FROM totals GROUP BY 1
    ), trends AS (
      SELECT bucket, metric, sum(total) AS count
      FROM counts WHERE metric IN ('views', 'inquiries', 'offers') GROUP BY 1, 2
    ), accepted_cohort AS (
      SELECT count(*) AS count FROM offers
      WHERE from_buyer AND created_at <= ${asOf}::timestamptz AND status = 'accepted' AND responded_at <= ${asOf}::timestamptz
        AND created_at >= COALESCE(${from}::date::timestamp AT TIME ZONE 'UTC', '-infinity')
    ), detail_views AS (
      SELECT count(*) AS total, count(*) FILTER (WHERE viewed_on >= ${recent}::date) AS recent
      FROM listing_view_events v JOIN owned l ON l.id = v.listing_id
      WHERE ${ids.length === 1} AND v.viewed_on BETWEEN ${viewStart}::date AND ${today}::date
    ), insight_input AS (
      SELECT l.id, l.title,
        COALESCE((m.metrics->>'views')::numeric, 0) AS views,
        COALESCE((m.metrics->>'inquiries')::numeric, 0) AS inquiries,
        COALESCE((m.metrics->>'offers')::numeric, 0) AS offers
      FROM owned l JOIN by_listing m ON m.listing_id = l.id
    ), insight_rules AS (
      SELECT id, title, views, inquiries,
        CASE
          WHEN views >= 100 AND inquiries * 100 < views * 2
            AND ${from}::date >= (${coverage}::timestamptz AT TIME ZONE 'UTC')::date + 1
            THEN 'few_inquiries'
          WHEN inquiries >= 5 AND offers = 0 THEN 'no_offers'
        END AS rule
      FROM insight_input
    ), insight_candidates AS (
      SELECT id, title, CASE WHEN rule = 'few_inquiries' THEN views END AS views, inquiries, rule
      FROM insight_rules WHERE rule IS NOT NULL
      ORDER BY views DESC NULLS LAST, inquiries DESC, id LIMIT 5
    ), status_counts AS (
      SELECT 'listings' AS group_name, status::text AS status, count(*) AS total FROM owned GROUP BY status
      UNION ALL
      SELECT 'inquiries', status, count(*) FROM seller_inquiries GROUP BY status
      UNION ALL
      SELECT 'offers', status, count(*) FROM offers GROUP BY status
      UNION ALL
      SELECT 'deals', status, count(*) FROM seller_deals GROUP BY status
    ), status_groups AS (
      SELECT group_name, jsonb_object_agg(status, total) AS counts FROM status_counts GROUP BY group_name
    ), top_inquiry_listings AS (
      SELECT l.id, l.title, t.count FROM totals t JOIN owned l ON l.id = t.listing_id
      WHERE t.metric = 'inquiries' ORDER BY t.count DESC, l.id LIMIT 8
    ), listing_completions AS (
      SELECT listing_id, max(completed_at) AS completed_at
      FROM seller_deals WHERE ${ids.length > 0} GROUP BY listing_id
    )
    SELECT
      (SELECT jsonb_object_agg(metric, count) FROM (SELECT metric, sum(count) AS count FROM totals GROUP BY metric) sums) AS totals,
      (SELECT jsonb_agg(jsonb_build_object('date', bucket, 'metric', metric, 'count', count) ORDER BY bucket) FROM trends) AS trends,
      (SELECT count(*)::integer FROM owned) AS "listingCount",
      (SELECT count(*)::integer FROM offers WHERE status = 'pending') AS "pendingOffers",
      (SELECT count::float8 FROM accepted_cohort) AS "cohortAccepted",
      (SELECT jsonb_build_object('total', total, 'recent', recent) FROM detail_views) AS "detailViews",
      (SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'status', l.status,
        'publishedAt', l.published_at AT TIME ZONE 'UTC',
        'completedAt', c.completed_at,
        'metrics', m.metrics
      ) ORDER BY l.id) FROM owned l LEFT JOIN by_listing m ON m.listing_id = l.id
      LEFT JOIN listing_completions c ON c.listing_id = l.id WHERE ${ids.length > 0}) AS listings,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY views DESC NULLS LAST, inquiries DESC, id) FROM insight_candidates i) AS insights,
      (SELECT jsonb_object_agg(group_name, counts) FROM status_groups) AS "statusCounts",
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY count DESC, id) FROM top_inquiry_listings t) AS "inquiriesByListing"
  `);

  const hasViews = Boolean(coverage);
  const metrics = values => ({
    views: hasViews ? (values?.views ?? 0) : null,
    inquiries: values?.inquiries ?? 0,
    offers: values?.offers ?? 0,
    accepted: values?.accepted ?? 0,
    completed: values?.completed ?? 0,
  });
  const totals = metrics(result.totals);
  const points = new Map();
  const first =
    from ?? [viewStart, result.trends?.[0]?.date].filter(Boolean).sort()[0];
  const bucketStart =
    interval === 'month' && first ? first.slice(0, 7) + '-01' : first;
  for (
    let date = bucketStart && new Date(bucketStart);
    date && day(date) <= today;
  ) {
    const bucket = day(date);
    const bucketEnd =
      interval === 'month'
        ? day(
          new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
        )
        : day(new Date(date.getTime() + dayMs));
    points.set(bucket, {
      date: bucket,
      views: viewStart && bucketEnd > viewStart ? 0 : null,
      inquiries: 0,
      offers: 0,
    });
    date = new Date(bucketEnd);
  }
  for (const row of result.trends ?? []) {
    points.get(row.date)[row.metric] = row.count;
  }

  return {
    window,
    totals,
    offerAcceptanceRate: acceptanceRate(result.cohortAccepted, totals.offers),
    trends: [...points.values()],
    listingCount: result.listingCount,
    pendingOffers: result.pendingOffers,
    listings: (result.listings ?? []).map(listing => ({
      ...listing,
      metrics: metrics(listing.metrics),
    })),
    listingViews: ids.length === 1 && hasViews ? result.detailViews : null,
    insights: result.insights ?? [],
    statusCounts: result.statusCounts ?? {},
    inquiriesByListing: result.inquiriesByListing ?? [],
  };
}
