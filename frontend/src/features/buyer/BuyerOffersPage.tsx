import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { ArrowUpRight, Search } from "lucide-react";
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
import { useAuth } from "@/features/auth/useAuth";
import { getPublishedListing } from "@/features/marketplace/marketplace-api";
import {
  createOffer,
  listDeals,
  listOffers,
  respondToOffer,
  withdrawOffer,
  type Deal,
  type Offer,
} from "@/features/deals/api";
import { OfferComposer } from "@/features/deals/OfferComposer";
import { OfferTimeline } from "@/features/deals/OfferTimeline";
import { toApiError } from "@/lib/api-error";

type ConfirmAction = {
  offer: Offer;
  kind: "accept" | "reject" | "withdraw";
} | null;
const negotiable = new Set<Deal["status"]>([
  "proposed",
  "negotiating",
  "due_diligence",
]);

export function BuyerOffersPage() {
  const user = useAuth().user;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDealId = Number(searchParams.get("deal"));
  const [dealSearch, setDealSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", 1, 100],
    queryFn: () => listDeals(1, 100),
    staleTime: 15_000,
  });
  const deals = useMemo(
    () => dealsQuery.data?.deals ?? [],
    [dealsQuery.data?.deals],
  );
  const selectedDeal =
    deals.find((deal) => deal.id === queryDealId) ?? deals[0];
  const offersQuery = useQuery({
    queryKey: ["deals", selectedDeal?.id, "offers"],
    queryFn: () => listOffers(selectedDeal!.id),
    enabled: Boolean(selectedDeal),
    staleTime: 10_000,
  });
  const listingQuery = useQuery({
    queryKey: ["marketplace", "listing", selectedDeal?.listing_id],
    queryFn: () => getPublishedListing(selectedDeal!.listing_id),
    enabled: Boolean(selectedDeal),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!deals.length) return;
    if (!deals.some((deal) => deal.id === queryDealId)) {
      setSearchParams({ deal: String(deals[0].id) }, { replace: true });
    }
  }, [deals, queryDealId, setSearchParams]);

  const filteredDeals = useMemo(() => {
    const needle = dealSearch.trim().toLocaleLowerCase();
    if (!needle) return deals;
    return deals.filter((deal) =>
      `deal ${deal.id} business ${deal.listing_id} ${deal.status}`.includes(
        needle,
      ),
    );
  }, [dealSearch, deals]);
  const offers = offersQuery.data?.offers ?? [];
  const currentPending = offers.find((offer) => offer.status === "pending");
  const incomingOffer =
    currentPending && currentPending.created_by !== user?.id
      ? currentPending
      : undefined;
  const canNegotiate = Boolean(
    selectedDeal && negotiable.has(selectedDeal.status),
  );

  const invalidateSelected = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deals", "mine"] }),
      queryClient.invalidateQueries({ queryKey: ["deals", selectedDeal?.id] }),
      queryClient.invalidateQueries({
        queryKey: ["deals", selectedDeal?.id, "offers"],
      }),
    ]);
  };
  const submitOfferMutation = useMutation({
    mutationFn: (input: Parameters<typeof createOffer>[1]) =>
      createOffer(selectedDeal!.id, input),
    onSuccess: async () => {
      setNotice("Your offer was submitted.");
      setError("");
      await invalidateSelected();
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const actionMutation = useMutation({
    mutationFn: async ({ offer, kind }: Exclude<ConfirmAction, null>) => {
      if (kind === "withdraw") return withdrawOffer(offer.deal_id, offer.id);
      return respondToOffer(offer.deal_id, offer.id, kind);
    },
    onSuccess: async (_offer, variables) => {
      setNotice(
        variables.kind === "accept"
          ? "Offer accepted. Deal status updated."
          : variables.kind === "reject"
            ? "Offer rejected."
            : "Your offer was withdrawn.",
      );
      setError("");
      setConfirm(null);
      await invalidateSelected();
    },
    onError: (reason) => setError(toApiError(reason).message),
  });

  return (
    <>
      <WorkspacePageHeader
        description="Review proposals, compare counteroffers, and respond from the associated deal."
        eyebrow="Buyer workspace · Negotiations"
        title="Offers"
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {dealsQuery.isPending ? <WorkspaceSkeleton rows={2} /> : null}
      {dealsQuery.isError ? (
        <ErrorState
          description="Offers are stored within deals. The deal list could not be loaded."
          onRetry={() => void dealsQuery.refetch()}
          title="Offers unavailable"
        />
      ) : null}
      {dealsQuery.data && deals.length === 0 ? (
        <WorkspaceEmpty
          action={
            <Button asChild variant="accent">
              <a href="/marketplace">Explore businesses</a>
            </Button>
          }
          description="Start an acquisition from a published listing to open a deal and submit your first offer."
          title="No offers or deals yet"
        />
      ) : null}

      {dealsQuery.data && deals.length ? (
        <div className="grid items-start gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <SectionCard className="p-4 sm:p-4">
            <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-ink-soft focus-within:border-emerald-600">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label="Search deals"
                className="min-w-0 flex-1 bg-transparent text-xs text-navy-950 outline-none"
                onChange={(event) => setDealSearch(event.target.value)}
                placeholder="Search deals"
                value={dealSearch}
              />
            </label>
            <nav aria-label="Deals with offers" className="space-y-1">
              {filteredDeals.map((deal) => (
                <button
                  aria-current={
                    selectedDeal?.id === deal.id ? "true" : undefined
                  }
                  className={`w-full rounded-lg border p-3 text-left transition ${selectedDeal?.id === deal.id ? "border-emerald-700/20 bg-emerald-50" : "border-transparent hover:bg-[#F7F9F7]"}`}
                  key={deal.id}
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setSearchParams({ deal: String(deal.id) });
                  }}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-navy-950">
                      Deal #{deal.id}
                    </span>
                    <StatusBadge status={deal.status} />
                  </span>
                  <span className="mt-1.5 block text-[0.68rem] text-ink-soft">
                    Business listing #{deal.listing_id}
                  </span>
                </button>
              ))}
            </nav>
            {dealsQuery.data.pagination.total > deals.length ? (
              <p className="mt-3 text-[0.65rem] leading-5 text-ink-faint">
                Showing the 100 most recently updated deals. Open the deal list
                to review the full page set.
              </p>
            ) : null}
          </SectionCard>

          {selectedDeal ? (
            <div className="space-y-5">
              <SectionCard>
                <SectionHeading
                  description={`Deal #${selectedDeal.id} · Created ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(selectedDeal.created_at))}`}
                  title={
                    listingQuery.data?.title ??
                    `Business listing #${selectedDeal.listing_id}`
                  }
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedDeal.status} />
                    <span className="text-xs text-ink-soft">
                      Updated{" "}
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(selectedDeal.updated_at))}
                    </span>
                  </div>
                  {listingQuery.data ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/listings/${selectedDeal.listing_id}`}>
                        Business details{" "}
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-ink-faint">
                      Public listing unavailable
                    </span>
                  )}
                </div>
                {listingQuery.isError ? (
                  <p className="mt-3 text-xs text-ink-soft">
                    The listing may no longer be public. Deal history remains
                    available to its participants.
                  </p>
                ) : null}
              </SectionCard>

              <SectionCard>
                <SectionHeading
                  description="Amounts are shown in each offer’s stated currency; no conversion is applied."
                  title="Negotiation history"
                />
                {offersQuery.isPending ? (
                  <div
                    aria-label="Loading offer history"
                    className="h-40 animate-pulse rounded-xl bg-mist"
                    role="status"
                  />
                ) : null}
                {offersQuery.isError ? (
                  <ErrorState
                    description="Offer history could not be loaded."
                    onRetry={() => void offersQuery.refetch()}
                    title="History unavailable"
                  />
                ) : null}
                {offersQuery.data ? (
                  <OfferTimeline
                    buyerId={selectedDeal.buyer_id}
                    currentUserId={user?.id ?? 0}
                    offers={offers}
                    actionForOffer={(offer) =>
                      offer.status === "pending" &&
                      offer.created_by !== user?.id &&
                      canNegotiate ? (
                        <>
                          <Button
                            disabled={actionMutation.isPending}
                            onClick={() =>
                              setConfirm({ offer, kind: "accept" })
                            }
                            size="sm"
                            variant="accent"
                          >
                            Accept
                          </Button>
                          <Button
                            disabled={actionMutation.isPending}
                            onClick={() =>
                              setConfirm({ offer, kind: "reject" })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Reject
                          </Button>
                        </>
                      ) : offer.status === "pending" &&
                        offer.created_by === user?.id &&
                        canNegotiate ? (
                        <Button
                          disabled={actionMutation.isPending}
                          onClick={() =>
                            setConfirm({ offer, kind: "withdraw" })
                          }
                          size="sm"
                          variant="outline"
                        >
                          Withdraw offer
                        </Button>
                      ) : null
                    }
                  />
                ) : null}
              </SectionCard>

              {canNegotiate ? (
                <SectionCard>
                  <SectionHeading
                    description={
                      incomingOffer
                        ? `Replying to offer #${incomingOffer.id} will supersede it and preserve the full history.`
                        : currentPending
                          ? "Your pending offer is awaiting a response."
                          : "Submit a new proposal in the listing currency or another supported currency."
                    }
                    title={
                      incomingOffer ? "Make a counteroffer" : "Submit an offer"
                    }
                  />
                  {!currentPending || incomingOffer ? (
                    <OfferComposer
                      askingPrice={
                        listingQuery.data?.askingPrice == null
                          ? null
                          : String(listingQuery.data.askingPrice)
                      }
                      disabled={
                        submitOfferMutation.isPending || !listingQuery.data
                      }
                      listingCurrency={listingQuery.data?.currency ?? "USD"}
                      onSubmit={async (input) => {
                        await submitOfferMutation.mutateAsync(input);
                      }}
                      parentOfferId={incomingOffer?.id}
                    />
                  ) : (
                    <p className="text-sm text-ink-soft">
                      A pending offer already exists. Wait for the other
                      participant to respond before submitting another proposal.
                    </p>
                  )}
                </SectionCard>
              ) : (
                <SectionCard>
                  <p className="text-sm font-semibold text-navy-950">
                    Negotiation is closed
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">
                    The backend does not accept offers while this deal is{" "}
                    {selectedDeal.status.replaceAll("_", " ")}.
                  </p>
                </SectionCard>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          busy={actionMutation.isPending}
          busyLabel="Updating offer…"
          confirmLabel={
            confirm.kind === "accept"
              ? "Accept offer"
              : confirm.kind === "reject"
                ? "Reject offer"
                : "Withdraw offer"
          }
          description={
            confirm.kind === "accept"
              ? "Accepting this offer will mark the deal as accepted and close other pending offers. Continue?"
              : confirm.kind === "reject"
                ? "Reject this pending offer? This response will be recorded in the negotiation history."
                : "Withdraw your pending offer? This action will be recorded in the deal history."
          }
          error={
            actionMutation.isError
              ? toApiError(actionMutation.error).message
              : undefined
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => actionMutation.mutate(confirm)}
          title={
            confirm.kind === "accept"
              ? "Accept this offer?"
              : confirm.kind === "reject"
                ? "Reject this offer?"
                : "Withdraw this offer?"
          }
        />
      ) : null}
    </>
  );
}
