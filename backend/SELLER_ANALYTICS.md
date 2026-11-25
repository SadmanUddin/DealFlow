# Phase 11 seller analytics

## Counting rules

| Metric | Source and date |
| --- | --- |
| Listing views | One eligible visit per verified account, public listing, and UTC day from the date tracking is enabled. |
| Inquiries received | Buyer conversations, grouped by creation date. |
| Offers received | Buyer-authored offers and counteroffers, grouped by creation date. |
| Accepted offers | Accepted buyer offers and seller counteroffers, grouped by response date. An acceptance remains a historical event if the deal later falls through. |
| Completed acquisitions | Deals with a recorded closing timestamp after both parties confirmed. |
| Buyer-offer acceptance rate | Buyer offers created in the selected period and accepted as of the query, divided by all buyer offers created in that period. A zero denominator returns N/A. Pending offers can change this result later. |

Fixed ranges include the current, partial UTC day and the preceding 6, 29, or 89 calendar days. All time uses UTC months. The first traffic day and month may be partial. Charts show gaps before view tracking, and engagement can use earlier records. The activity funnel counts independent events. It cannot establish that one buyer moved through all stages.

The pipeline status panel shows a current snapshot across all dates. Its inquiry ranking uses the selected period.

The comparison uses the same selected range for all businesses, with the latest publication date and current status alongside each result. Availability history is insufficient to compute exact days publicly available. Rules flag periods with at least 100 recorded views and fewer than two inquiries per 100 recorded views following the launch day, or periods with at least five inquiries and zero buyer offers. These are independent event counts.

## View privacy and retention

DealFlow counts eligible interactions on visible public listing detail pages, including sold listings. Visitors must sign in with a verified account and opt in on the listing detail page. The browser remembers consent for that account until it is cleared or withdrawn. Global Privacy Control and Do Not Track signals suppress collection. Anonymous users, administrators, and the listing owner are excluded. Simple reads, card impressions, prefetches, and monitoring probes generate no view writes. A passive reader who never interacts may be excluded. The metric is a limited sample of marketplace traffic. Unique visitors are omitted.

The write endpoint requires an active session, CSRF token, approved origin, JSON consent, and browser request metadata. Arcjet applies dedicated account/IP limits, and a write fails closed if its production security check is unavailable. These controls and a unique index limit inflation. They cannot prove that every authenticated interaction came from a human.

Analytics storage consists of a listing ID, UTC date, and a keyed daily deduplication value scoped to that listing. The existing worker clears keys older than yesterday in UTC on an hourly schedule. Date-only view records remain available until the listing is deleted. The analytics table holds no raw IP, authentication token, visitor ID, or user agent. Arcjet continues to use existing request characteristics for abuse prevention. Seller endpoints expose aggregates and the seller’s own listing metadata.

## Rollout

1. Review and apply migration `0024_seller_analytics.sql` before deploying the analytics API.
2. Deploy the API and the updated worker. Set `LISTING_VIEW_TRACKING_SINCE` to the actual UTC start time on both services. Once set, keep that timestamp stable to preserve coverage. Keep the JWT signing secret consistent across instances. A same-day rotation can allow a repeat view for an account.
3. Build the frontend with `VITE_LISTING_VIEW_TRACKING=true` to expose the opt-in control. The setting defaults to off.
4. In staging, confirm that an opted-in account can generate one view while the listing owner and anonymous traffic generate none. Confirm that the worker clears expired keys and that the date-only counts remain available.
