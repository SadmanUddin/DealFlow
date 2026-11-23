import { StatusBadge } from "@/components/shared/workspace/WorkspaceUI";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import type { Deal } from "./api";
import type { Diligence } from "./diligence-api";

import { diligenceDateLabel } from "./diligence-format";

export function DiligenceSummary({
  deal,
  diligence,
}: {
  deal: Deal;
  diligence: Diligence;
}) {
  const { progress } = diligence;
  const percent =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : null;
  const milestones = [
    ["Offer accepted", deal.accepted_at],
    ["Due diligence started", diligence.startedAt],
    ["First document accepted", diligence.firstDocumentAcceptedAt],
    ["Final terms agreed", deal.closing_agreed_at],
    ["Acquisition completed", deal.completed_at],
  ] as const;
  const agreedPrice =
    deal.closing_agreed_at && deal.closing_amount && deal.closing_currency
      ? formatListingMoney(deal.closing_amount, deal.closing_currency)
      : "Awaiting agreement";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-label="Diligence progress"
        className="min-w-0 rounded-xl border border-line bg-paper p-4"
      >
        <h3 className="font-semibold text-navy-950">Diligence progress</h3>
        {percent === null ? (
          <p className="mt-2 text-sm text-ink-soft">
            Add a checklist item to start tracking progress.
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-sm font-semibold">
              {progress.completed} of {progress.total} tasks completed (
              {percent}%)
            </p>
            <progress
              className="h-2 w-full accent-emerald-800"
              aria-label="Checklist completion"
              value={progress.completed}
              max={progress.total}
            />
          </div>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ["Total tasks", progress.total],
              ["Completed", progress.completed],
              ["Pending", progress.pending],
              ["In progress", progress.inProgress],
              ["Blocked", progress.blocked],
              ["Overdue", progress.overdue],
              ["Outstanding document requests", progress.outstandingRequests],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="rounded-lg bg-white p-2">
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="font-semibold">{count}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        aria-label="Deal completion summary"
        className="min-w-0 rounded-xl border border-line bg-paper p-4"
      >
        <h3 className="font-semibold text-navy-950">Deal completion summary</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-soft">Buyer</dt>
            <dd className="break-words">{deal.buyer_name ?? "Buyer"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Seller</dt>
            <dd className="break-words">{deal.seller_name ?? "Seller"}</dd>
          </div>
          {deal.agreed_offer && !deal.closing_agreed_at && (
            <div>
              <dt className="text-xs text-ink-soft">Accepted offer</dt>
              <dd>
                {formatListingMoney(
                  deal.agreed_offer.amount,
                  deal.agreed_offer.currency,
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-ink-soft">Agreed acquisition price</dt>
            <dd>{agreedPrice}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Deal status</dt>
            <dd>
              <StatusBadge status={deal.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Buyer confirmation</dt>
            <dd>
              {deal.buyer_confirmed_at ? "Confirmed" : "Awaiting confirmation"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Seller confirmation</dt>
            <dd>
              {deal.seller_confirmed_at ? "Confirmed" : "Awaiting confirmation"}
            </dd>
          </div>
        </dl>
        <h4 className="mt-4 text-sm font-semibold">Milestones</h4>
        <ol className="mt-2 space-y-1 text-xs text-ink-soft">
          {milestones.map(([label, timestamp]) => (
            <li className="flex flex-wrap justify-between gap-x-3" key={label}>
              <span>{label}</span>
              <span>
                {timestamp
                  ? diligenceDateLabel(timestamp)
                  : "Awaiting milestone"}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
