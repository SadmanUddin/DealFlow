import { ArrowDownLeft, ArrowUpRight, Check, Clock3 } from "lucide-react";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { StatusBadge } from "@/components/shared/workspace/WorkspaceUI";
import type { Offer } from "./api";

function formatDate(value: string | Date | null) {
  if (!value) return "Not responded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OfferTimeline({
  offers,
  buyerId,
  currentUserId,
  actionForOffer,
}: {
  offers: Offer[];
  buyerId: number;
  currentUserId: number;
  actionForOffer?: (offer: Offer) => React.ReactNode;
}) {
  if (offers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
        <Clock3
          aria-hidden="true"
          className="mx-auto text-ink-faint"
          size={19}
        />
        <p className="mt-3 text-sm font-semibold text-navy-950">
          No offers yet
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          When a participant submits a proposal, the terms and response history
          will appear here.
        </p>
      </div>
    );
  }

  return (
    <ol aria-label="Offer and counteroffer history" className="space-y-0">
      {offers.map((offer, index) => {
        const byBuyer = offer.created_by === buyerId;
        const isYou = offer.created_by === currentUserId;
        return (
          <li className="relative pb-5 last:pb-0" key={offer.id}>
            {index < offers.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[0.9rem] top-9 w-px bg-line"
              />
            ) : null}
            <div className="flex gap-3">
              <span
                className={`relative mt-0.5 grid size-[1.9rem] shrink-0 place-items-center rounded-full ring-4 ring-white ${byBuyer ? "bg-navy-900 text-white" : "bg-emerald-100 text-emerald-900"}`}
              >
                {byBuyer ? (
                  <ArrowUpRight aria-hidden="true" size={14} />
                ) : (
                  <ArrowDownLeft aria-hidden="true" size={14} />
                )}
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-navy-950">
                        {byBuyer ? "Buyer" : "Seller"}
                        {offer.created_by_name
                          ? ` · ${offer.created_by_name}`
                          : ""}
                        {isYou ? " · you" : ""}
                        {offer.parent_offer_id ? " counteroffer" : " offer"}
                      </h3>
                      <StatusBadge status={offer.status} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-soft">
                      Submitted {formatDate(offer.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-semibold tracking-tight text-navy-950">
                    {formatListingMoney(offer.amount, offer.currency)}
                  </p>
                </div>
                {offer.parent_offer_id ? (
                  <p className="mt-3 text-[0.68rem] text-ink-faint">
                    Responds to offer #{offer.parent_offer_id}
                  </p>
                ) : null}
                {offer.message ? (
                  <p className="mt-3 whitespace-pre-wrap border-l-2 border-emerald-300 pl-3 text-sm leading-6 text-ink-soft">
                    {offer.message}
                  </p>
                ) : null}
                {offer.responded_at ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-ink-faint">
                    <Check aria-hidden="true" size={13} /> Updated{" "}
                    {formatDate(offer.responded_at)}
                  </p>
                ) : null}
                {actionForOffer ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {actionForOffer(offer)}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
