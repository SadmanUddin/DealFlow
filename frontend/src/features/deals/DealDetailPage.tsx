import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  MessageSquareText,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { getPublishedListing } from "@/features/marketplace/marketplace-api";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { listMyListings } from "@/features/seller/api";
import { useAuth } from "@/features/auth/useAuth";
import { toApiError } from "@/lib/api-error";
import {
  getDeal,
  createOffer,
  listDealHistory,
  listOffers,
  respondToOffer,
  updateDealStatus,
  withdrawOffer,
  type Deal,
  type DealActivity,
  type Offer,
} from "./api";
import { OfferComposer } from "./OfferComposer";
import { OfferTimeline } from "./OfferTimeline";
import { DealConversationPanel } from "./DealConversationPanel";
import { DealDocumentsPanel } from "./DealDocumentsPanel";

type OfferAction = { offer: Offer; action: "accept" | "reject" | "withdraw" };
const negotiableStatuses = new Set<Deal["status"]>([
  "proposed",
  "negotiating",
  "due_diligence",
]);
const allowedTransitions: Record<Deal["status"], Deal["status"][]> = {
  proposed: ["negotiating", "cancelled", "rejected"],
  negotiating: ["due_diligence", "cancelled", "rejected"],
  due_diligence: ["cancelled", "rejected"],
  accepted: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};
const eventLabels: Record<string, string> = {
  "deal.created": "Deal opened",
  "offer.submitted": "Offer submitted",
  "offer.countered": "Counteroffer submitted",
  "offer.accepted": "Offer accepted",
  "offer.rejected": "Offer rejected",
  "offer.withdrawn": "Offer withdrawn",
  "deal.status_changed": "Deal status changed",
  "deal.document_linked": "Document added to deal room",
};

function dateLabel(value: string | Date | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function DealDetailPage() {
  const { id: rawId } = useParams();
  const id = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  const validId = Number.isSafeInteger(id) && id > 0;
  const { user } = useAuth();
  const client = useQueryClient();
  const isBuyer = user?.role === "buyer";
  const dealQuery = useQuery({
    queryKey: ["deals", id],
    queryFn: () => getDeal(id),
    enabled: validId,
    retry: false,
  });
  const deal = dealQuery.data;
  const buyerListingQuery = useQuery({
    queryKey: ["marketplace", "listing", deal?.listing_id],
    queryFn: () => getPublishedListing(deal!.listing_id),
    enabled: Boolean(deal && isBuyer),
    retry: false,
    staleTime: 30_000,
  });
  const sellerListingsQuery = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    enabled: Boolean(deal && !isBuyer),
    staleTime: 30_000,
  });
  const listing = isBuyer
    ? buyerListingQuery.data
    : sellerListingsQuery.data?.listings.find(
        (entry) => entry.id === deal?.listing_id,
      );
  const [offerPage, setOfferPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [counterParent, setCounterParent] = useState<number | undefined>();
  const [offerConfirmation, setOfferConfirmation] =
    useState<OfferAction | null>(null);
  const [statusConfirmation, setStatusConfirmation] = useState<
    Deal["status"] | null
  >(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const offersQuery = useQuery({
    queryKey: ["deals", id, "offers", offerPage, 100],
    queryFn: () => listOffers(id, offerPage, 100),
    enabled: validId && Boolean(deal),
  });
  const activityQuery = useQuery({
    queryKey: ["deals", id, "history", activityPage, 100],
    queryFn: () => listDealHistory(id, activityPage, 100),
    enabled: validId && Boolean(deal),
  });
  const offers = offersQuery.data?.offers ?? [];
  const pendingOffers = offers.filter((offer) => offer.status === "pending");
  const acceptedOffer = offers.find((offer) => offer.status === "accepted");
  const ownPending = pendingOffers.some(
    (offer) => offer.created_by === user?.id,
  );
  const incomingPending = pendingOffers.some(
    (offer) => offer.created_by !== user?.id,
  );

  const refreshDealData = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["deals", id] }),
      client.invalidateQueries({ queryKey: ["deals", "mine"] }),
      client.invalidateQueries({ queryKey: ["deals", id, "offers"] }),
      client.invalidateQueries({ queryKey: ["deals", id, "history"] }),
    ]);
  };
  const offerActionMutation = useMutation({
    mutationFn: ({ offer, action }: OfferAction) =>
      action === "withdraw"
        ? withdrawOffer(id, offer.id)
        : respondToOffer(id, offer.id, action),
    onSuccess: async (_result, variables) => {
      setOfferConfirmation(null);
      setFailure("");
      setNotice(
        variables.action === "accept"
          ? "Offer accepted. The deal is now marked accepted."
          : variables.action === "reject"
            ? "Offer rejected."
            : "Your offer was withdrawn.",
      );
      await refreshDealData();
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const dealStatusMutation = useMutation({
    mutationFn: (status: Deal["status"]) => updateDealStatus(id, status),
    onSuccess: async (updated) => {
      setStatusConfirmation(null);
      setFailure("");
      setNotice(
        `Deal status updated to ${updated.status.replaceAll("_", " ")}.`,
      );
      await refreshDealData();
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const offerMutation = useMutation({
    mutationFn: (input: Parameters<typeof createOffer>[1]) =>
      createOffer(id, input),
    onSuccess: async () => {
      setCounterParent(undefined);
      setNotice("Your offer was submitted.");
      setFailure("");
      await refreshDealData();
    },
    onError: (error) => setFailure(toApiError(error).message),
  });

  const activities = useMemo(
    () => [...(activityQuery.data?.activities ?? [])].reverse(),
    [activityQuery.data?.activities],
  );
  const backTo = isBuyer ? "/buyer/deals" : "/seller/deals";

  if (!validId) {
    return (
      <ErrorState
        description="The deal identifier in this address is invalid."
        title="Deal unavailable"
      />
    );
  }
  if (dealQuery.isPending) return <WorkspaceSkeleton rows={3} />;
  if (dealQuery.isError || !deal) {
    return (
      <div>
        <Button asChild className="mb-5" size="sm" variant="ghost">
          <Link to={backTo}>
            <ArrowLeft aria-hidden="true" size={15} /> Back to deals
          </Link>
        </Button>
        <ErrorState
          description="This deal could not be loaded. Access is limited to its participants."
          onRetry={() => void dealQuery.refetch()}
          title="Deal unavailable"
        />
      </div>
    );
  }

  const negotiable = negotiableStatuses.has(deal.status);
  const nextStatuses = allowedTransitions[deal.status];
  const listingIsLoading = isBuyer
    ? buyerListingQuery.isPending
    : sellerListingsQuery.isPending;
  const listingError = isBuyer
    ? buyerListingQuery.isError
    : sellerListingsQuery.isError;

  return (
    <>
      <WorkspacePageHeader
        description="A participant-only workspace for acquisition terms, negotiation, milestones, and private deal files."
        eyebrow={`${isBuyer ? "Buyer" : "Seller"} workspace · Deal #${deal.id}`}
        title={listing?.title ?? `Business listing #${deal.listing_id}`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to={backTo}>
              <ArrowLeft aria-hidden="true" size={15} /> All deals
            </Link>
          </Button>
        }
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {failure}
        </p>
      ) : null}

      <div className="space-y-5">
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Deal summary"
        >
          <Summary
            label="Deal status"
            value={<StatusBadge status={deal.status} />}
            detail={`Last updated ${dateLabel(deal.updated_at)}`}
            icon={<Workflow size={17} />}
          />
          <Summary
            label="Asking price"
            value={
              listing
                ? formatListingMoney(listing.askingPrice, listing.currency)
                : "Not available"
            }
            detail={
              listing
                ? `${listing.currency} · public or seller listing data`
                : "Listing is no longer available to this workspace"
            }
            icon={<Building2 size={17} />}
          />
          <Summary
            label="Accepted offer"
            value={
              acceptedOffer
                ? formatListingMoney(
                    acceptedOffer.amount,
                    acceptedOffer.currency,
                  )
                : "No accepted offer"
            }
            detail={
              acceptedOffer
                ? `Agreed ${acceptedOffer.currency} terms`
                : "Shown when a participant accepts an offer"
            }
            icon={<CircleDollarSign size={17} />}
          />
          <Summary
            label="Opened"
            value={dateLabel(deal.created_at)}
            detail={
              deal.accepted_at
                ? `Accepted ${dateLabel(deal.accepted_at)}`
                : "No expiration date is provided by the backend"
            }
            icon={<CalendarClock size={17} />}
          />
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-5">
            <SectionCard>
              <SectionHeading
                description="The backend shares participant IDs but does not expose names or contact details in the deal response."
                title="Deal participants"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Participant
                  label="Buyer"
                  id={deal.buyer_id}
                  isYou={deal.buyer_id === user?.id}
                />
                <Participant
                  label="Seller"
                  id={deal.seller_id}
                  isYou={deal.seller_id === user?.id}
                />
              </div>
              {listing ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-xs text-ink-soft">Business</p>
                    <p className="mt-1 text-sm font-semibold text-navy-950">
                      {listing.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {[listing.industry, listing.location]
                        .filter(Boolean)
                        .join(" · ") || "Business details available"}
                    </p>
                  </div>
                  {isBuyer ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/listings/${deal.listing_id}`}>
                        Public listing{" "}
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : listingIsLoading ? (
                <div
                  aria-label="Loading business information"
                  className="mt-4 h-16 animate-pulse rounded-lg bg-mist"
                  role="status"
                />
              ) : listingError ? (
                <p className="mt-4 text-xs text-ink-soft">
                  Business details could not be loaded; deal records remain
                  available.
                </p>
              ) : (
                <p className="mt-4 text-xs text-ink-soft">
                  The listing is not currently available in your public or
                  seller listing results.
                </p>
              )}
            </SectionCard>

            <SectionCard>
              <SectionHeading
                description="Each amount keeps the currency stated in its offer. The timeline reflects immutable backend offer records."
                title="Offer and counteroffer history"
              />
              {offersQuery.isPending ? (
                <div
                  aria-label="Loading offer history"
                  className="h-36 animate-pulse rounded-xl bg-mist"
                  role="status"
                />
              ) : null}
              {offersQuery.isError ? (
                <ErrorState
                  description="The offer history could not be loaded."
                  onRetry={() => void offersQuery.refetch()}
                  title="Offer history unavailable"
                />
              ) : null}
              {offersQuery.data ? (
                <OfferTimeline
                  buyerId={deal.buyer_id}
                  currentUserId={user?.id ?? 0}
                  offers={offers}
                  actionForOffer={(offer) => {
                    if (!negotiable || offer.status !== "pending") return null;
                    if (offer.created_by === user?.id)
                      return (
                        <Button
                          disabled={offerActionMutation.isPending}
                          onClick={() =>
                            setOfferConfirmation({ offer, action: "withdraw" })
                          }
                          size="sm"
                          variant="outline"
                        >
                          Withdraw offer
                        </Button>
                      );
                    return (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={offerActionMutation.isPending}
                          onClick={() =>
                            setOfferConfirmation({ offer, action: "accept" })
                          }
                          size="sm"
                          variant="accent"
                        >
                          Accept
                        </Button>
                        <Button
                          disabled={offerActionMutation.isPending}
                          onClick={() =>
                            setOfferConfirmation({ offer, action: "reject" })
                          }
                          size="sm"
                          variant="outline"
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={offerMutation.isPending}
                          onClick={() => {
                            setCounterParent(offer.id);
                            setFailure("");
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Counteroffer
                        </Button>
                      </div>
                    );
                  }}
                />
              ) : null}
              {offersQuery.data?.pagination.totalPages &&
              offersQuery.data.pagination.totalPages > 1 ? (
                <Pagination
                  page={offerPage}
                  pages={offersQuery.data.pagination.totalPages}
                  busy={offersQuery.isFetching}
                  onChange={setOfferPage}
                  label="Offer history pages"
                />
              ) : null}
            </SectionCard>

            {negotiable &&
            offersQuery.data &&
            !incomingPending &&
            !ownPending ? (
              <SectionCard>
                <SectionHeading
                  description={
                    counterParent
                      ? `Responding to offer #${counterParent}. The server will supersede that pending proposal.`
                      : "Submit a proposal in the listing currency or another supported ISO 4217 currency."
                  }
                  title={
                    counterParent ? "Make a counteroffer" : "Submit an offer"
                  }
                />
                {listing ? (
                  <OfferComposer
                    key={`${deal.id}-${counterParent ?? "new"}`}
                    askingPrice={
                      listing.askingPrice == null
                        ? null
                        : String(listing.askingPrice)
                    }
                    listingCurrency={listing.currency}
                    parentOfferId={counterParent}
                    confirmBeforeSubmit
                    onSubmit={async (input) => {
                      await offerMutation.mutateAsync(input);
                    }}
                  />
                ) : (
                  <WorkspaceEmpty
                    title="Listing currency unavailable"
                    description="The deal can be reviewed, but a validated offer cannot be composed without its original listing currency."
                  />
                )}
              </SectionCard>
            ) : null}
            {negotiable && (incomingPending || ownPending) && !counterParent ? (
              <SectionCard>
                <p className="text-sm font-semibold text-navy-950">
                  A proposal is pending
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  Use the actions shown on a pending incoming offer, or wait for
                  the other participant to respond to your proposal before
                  opening another offer.
                </p>
              </SectionCard>
            ) : null}
            {counterParent && negotiable ? (
              <SectionCard>
                <SectionHeading
                  description={`Countering pending offer #${counterParent}.`}
                  title="Counteroffer terms"
                />
                <Button
                  className="mb-4"
                  onClick={() => setCounterParent(undefined)}
                  size="sm"
                  variant="ghost"
                >
                  Cancel counteroffer
                </Button>
                {listing ? (
                  <OfferComposer
                    key={`${deal.id}-counter-${counterParent}`}
                    askingPrice={
                      listing.askingPrice == null
                        ? null
                        : String(listing.askingPrice)
                    }
                    listingCurrency={listing.currency}
                    parentOfferId={counterParent}
                    confirmBeforeSubmit
                    onSubmit={async (input) => {
                      await offerMutation.mutateAsync(input);
                    }}
                  />
                ) : null}
              </SectionCard>
            ) : null}

            <SectionCard>
              <SectionHeading
                description="Backend events only; actor IDs are shown without exposing account contact details."
                title="Deal activity"
              />
              {activityQuery.isPending ? (
                <div
                  aria-label="Loading deal activity"
                  className="h-32 animate-pulse rounded-xl bg-mist"
                  role="status"
                />
              ) : null}
              {activityQuery.isError ? (
                <ErrorState
                  description="Deal activity could not be loaded."
                  onRetry={() => void activityQuery.refetch()}
                  title="Activity unavailable"
                />
              ) : null}
              {activityQuery.data ? (
                activities.length ? (
                  <ActivityTimeline
                    activities={activities}
                    buyerId={deal.buyer_id}
                  />
                ) : (
                  <WorkspaceEmpty
                    title="No activity recorded"
                    description="Deal creation, offer, status, and document events appear here after the backend records them."
                  />
                )
              ) : null}
              {activityQuery.data?.pagination.totalPages &&
              activityQuery.data.pagination.totalPages > 1 ? (
                <Pagination
                  page={activityPage}
                  pages={activityQuery.data.pagination.totalPages}
                  busy={activityQuery.isFetching}
                  onChange={setActivityPage}
                  label="Activity pages"
                />
              ) : null}
            </SectionCard>

            {isBuyer ? (
              <DealConversationPanel
                deal={deal}
                currentUserId={user?.id ?? 0}
              />
            ) : (
              <SectionCard>
                <SectionHeading
                  title="Buyer conversation"
                  description="Conversation content stays inside its authorized private inquiry. Open the matching inquiry from your seller workspace to exchange messages and upload source documents."
                />
                <Button asChild size="sm" variant="outline">
                  <Link to="/seller/inquiries">
                    <MessageSquareText aria-hidden="true" size={14} /> Seller
                    inquiries
                  </Link>
                </Button>
              </SectionCard>
            )}

            <DealDocumentsPanel
              dealId={deal.id}
              listingId={deal.listing_id}
              isBuyer={isBuyer}
            />
          </div>

          <aside className="space-y-5">
            <SectionCard>
              <SectionHeading
                description="These transitions mirror the backend lifecycle. The server validates every request."
                title="Deal progression"
              />
              <ol className="space-y-2" aria-label="Deal lifecycle statuses">
                {[
                  "proposed",
                  "negotiating",
                  "due_diligence",
                  "accepted",
                  "completed",
                ].map((status) => (
                  <li
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${status === deal.status ? "bg-emerald-50 font-semibold text-emerald-950" : "text-ink-soft"}`}
                    key={status}
                  >
                    <span className="capitalize">
                      {status.replaceAll("_", " ")}
                    </span>
                    {status === deal.status ? (
                      <span aria-label="Current status">
                        <Check aria-hidden="true" size={14} />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[0.68rem] leading-5 text-ink-faint">
                Cancelled and rejected are terminal outcomes. Neither is omitted
                from the status badge or history.
              </p>
              {nextStatuses.length ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-xs font-semibold text-navy-950">
                    Available actions
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {nextStatuses.map((status) => (
                      <Button
                        className="justify-start"
                        disabled={dealStatusMutation.isPending}
                        key={status}
                        onClick={() => setStatusConfirmation(status)}
                        size="sm"
                        variant={status === "completed" ? "accent" : "outline"}
                      >
                        Mark {status.replaceAll("_", " ")}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-mist px-3 py-2 text-xs text-ink-soft">
                  This deal is closed. No further state changes are available.
                </p>
              )}
            </SectionCard>
            <SectionCard>
              <SectionHeading title="Deal record" />
              <dl className="space-y-3 text-xs">
                <Record label="Deal ID" value={`#${deal.id}`} />
                <Record label="Listing ID" value={`#${deal.listing_id}`} />
                <Record label="Buyer account" value={`#${deal.buyer_id}`} />
                <Record label="Seller account" value={`#${deal.seller_id}`} />
                <Record label="Created" value={dateLabel(deal.created_at)} />
                <Record
                  label="Last activity"
                  value={dateLabel(deal.updated_at)}
                />
              </dl>
            </SectionCard>
          </aside>
        </div>
      </div>

      {offerConfirmation ? (
        <ConfirmDialog
          busy={offerActionMutation.isPending}
          busyLabel="Updating offer…"
          confirmLabel={
            offerConfirmation.action === "accept"
              ? "Accept offer"
              : offerConfirmation.action === "reject"
                ? "Reject offer"
                : "Withdraw offer"
          }
          description={
            offerConfirmation.action === "accept"
              ? "Accepting this pending offer marks the deal accepted and supersedes any other pending offers."
              : offerConfirmation.action === "reject"
                ? "Reject this pending offer? The response will be recorded in deal history."
                : "Withdraw your pending offer? The response will be recorded in deal history."
          }
          error={failure}
          onCancel={() => {
            if (!offerActionMutation.isPending) setOfferConfirmation(null);
          }}
          onConfirm={() => offerActionMutation.mutate(offerConfirmation)}
          title={
            offerConfirmation.action === "accept"
              ? "Accept this offer?"
              : offerConfirmation.action === "reject"
                ? "Reject this offer?"
                : "Withdraw this offer?"
          }
        >
          <p className="rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-navy-950">
            {formatListingMoney(
              offerConfirmation.offer.amount,
              offerConfirmation.offer.currency,
            )}
          </p>
        </ConfirmDialog>
      ) : null}
      {statusConfirmation ? (
        <ConfirmDialog
          busy={dealStatusMutation.isPending}
          busyLabel="Updating deal…"
          confirmLabel={`Mark ${statusConfirmation.replaceAll("_", " ")}`}
          description={`Change this deal from ${deal.status.replaceAll("_", " ")} to ${statusConfirmation.replaceAll("_", " ")}? This event will be added to the deal history and the other participant will be notified.`}
          error={failure}
          onCancel={() => {
            if (!dealStatusMutation.isPending) setStatusConfirmation(null);
          }}
          onConfirm={() => dealStatusMutation.mutate(statusConfirmation)}
          title="Confirm deal status change"
        />
      ) : null}
    </>
  );
}

function Summary({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
          {label}
        </p>
        <span className="text-emerald-800">{icon}</span>
      </div>
      <div className="mt-3 text-base font-semibold text-navy-950">{value}</div>
      <p className="mt-1.5 text-[0.68rem] leading-5 text-ink-soft">{detail}</p>
    </div>
  );
}

function Participant({
  label,
  id,
  isYou,
}: {
  label: string;
  id: number;
  isYou: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <p className="text-xs font-semibold text-navy-950">
        {label}
        {isYou ? " · you" : ""}
      </p>
      <p className="mt-1 text-xs text-ink-soft">DealFlow account #{id}</p>
    </div>
  );
}

function Record({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-navy-950">{value}</dd>
    </div>
  );
}

function Pagination({
  page,
  pages,
  busy,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  busy: boolean;
  onChange: (page: number) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mt-5 flex items-center justify-between border-t border-line pt-4"
    >
      <span className="text-xs text-ink-soft">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1 || busy}
          onClick={() => onChange(page - 1)}
          size="sm"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" size={14} /> Previous
        </Button>
        <Button
          disabled={page >= pages || busy}
          onClick={() => onChange(page + 1)}
          size="sm"
          variant="outline"
        >
          Next <ChevronRight aria-hidden="true" size={14} />
        </Button>
      </div>
    </nav>
  );
}

function ActivityTimeline({
  activities,
  buyerId,
}: {
  activities: DealActivity[];
  buyerId: number;
}) {
  return (
    <ol aria-label="Deal activity timeline" className="space-y-0">
      {activities.map((activity, index) => {
        const metadata = activity.metadata;
        const amount =
          typeof metadata.amount === "string" ||
          typeof metadata.amount === "number"
            ? String(metadata.amount)
            : null;
        const currency =
          typeof metadata.currency === "string" ? metadata.currency : null;
        const from = typeof metadata.from === "string" ? metadata.from : null;
        const to = typeof metadata.to === "string" ? metadata.to : null;
        const actor =
          activity.actor_id === null
            ? "DealFlow"
            : activity.actor_id === buyerId
              ? "Buyer"
              : "Seller";
        const timestamp = new Date(activity.created_at);
        return (
          <li className="relative flex gap-3 pb-5 last:pb-0" key={activity.id}>
            <span className="relative mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-mist text-emerald-900">
              {index < activities.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-7 h-full w-px bg-line"
                />
              ) : null}
              <span className="size-1.5 rounded-full bg-emerald-700" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-navy-950">
                  {eventLabels[activity.event_type] ??
                    activity.event_type
                      .replaceAll(".", " ")
                      .replaceAll("_", " ")}
                </h3>
                <time
                  className="text-[0.65rem] text-ink-faint"
                  dateTime={
                    Number.isNaN(timestamp.getTime())
                      ? undefined
                      : timestamp.toISOString()
                  }
                >
                  {dateLabel(activity.created_at)}
                </time>
              </div>
              <p className="mt-1 text-[0.68rem] text-ink-soft">
                {actor}
                {from && to
                  ? ` · ${from.replaceAll("_", " ")} → ${to.replaceAll("_", " ")}`
                  : ""}
                {typeof metadata.offerId === "number"
                  ? ` · Offer #${metadata.offerId}`
                  : ""}
                {typeof metadata.documentId === "number"
                  ? ` · Document #${metadata.documentId}`
                  : ""}
              </p>
              {amount && currency ? (
                <p className="mt-1 text-xs font-semibold text-navy-950">
                  {formatListingMoney(amount, currency)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
