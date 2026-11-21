import { useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { OfferComposer } from "@/features/deals/OfferComposer";
import { OfferTimeline } from "@/features/deals/OfferTimeline";
import {
  createOffer,
  listDeals,
  listOffers,
  respondToOffer,
  type Deal,
  type Offer,
} from "@/features/deals/api";
import { useAuth } from "@/features/auth/useAuth";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { toApiError } from "@/lib/api-error";
import { listMyListings } from "./api";

type OfferAction = {
  dealId: number;
  offer: Offer;
  kind: "accept" | "reject";
} | null;
const negotiable = new Set<Deal["status"]>([
  "proposed",
  "negotiating",
  "due_diligence",
]);

export function SellerOffersPage() {
  const user = useAuth().user;
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<OfferAction>(null);
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", page, 20],
    queryFn: () => listDeals(page, 20),
    staleTime: 15_000,
  });
  const listingQuery = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    staleTime: 15_000,
  });
  const deals = useMemo(
    () => dealsQuery.data?.deals ?? [],
    [dealsQuery.data?.deals],
  );
  const offerQueries = useQueries({
    queries: deals.map((deal) => ({
      queryKey: ["deals", deal.id, "offers"],
      queryFn: () => listOffers(deal.id),
      staleTime: 10_000,
    })),
  });
  const dealId = Number(params.get("deal"));
  const selected = deals.find((deal) => deal.id === dealId) ?? deals[0];
  const selectedIndex = selected
    ? deals.findIndex((deal) => deal.id === selected.id)
    : -1;
  const selectedOffersQuery =
    selectedIndex >= 0 ? offerQueries[selectedIndex] : undefined;
  const listingById = useMemo(
    () =>
      new Map(
        (listingQuery.data?.listings ?? []).map((item) => [item.id, item]),
      ),
    [listingQuery.data?.listings],
  );
  const selectedListing = selected
    ? listingById.get(selected.listing_id)
    : undefined;
  const allOffers = offerQueries.flatMap((query) => query.data?.offers ?? []);
  const incoming = allOffers.filter(
    (offer) => offer.status === "pending" && offer.created_by !== user?.id,
  );
  const filteredDeals = deals.filter((deal) => {
    const needle = search.trim().toLocaleLowerCase();
    const listing = listingById.get(deal.listing_id);
    return (
      !needle ||
      `deal ${deal.id} ${listing?.title ?? ""} ${deal.status}`
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
  const acceptMutation = useMutation({
    mutationFn: (action: Exclude<OfferAction, null>) =>
      respondToOffer(action.dealId, action.offer.id, action.kind),
    onSuccess: async (_result, action) => {
      setConfirm(null);
      setNotice(
        action.kind === "accept"
          ? "Offer accepted; the deal has advanced according to the platform workflow."
          : "Offer rejected.",
      );
      setError("");
      await client.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const createOfferMutation = useMutation({
    mutationFn: (input: Parameters<typeof createOffer>[1]) =>
      createOffer(selected!.id, input),
    onSuccess: async () => {
      setNotice("Counteroffer submitted.");
      setError("");
      await client.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });

  return (
    <>
      <WorkspacePageHeader
        description="Review inbound proposals and counteroffers within their acquisition records."
        eyebrow="Seller workspace · Negotiation"
        title="Offers & deals"
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
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
      {dealsQuery.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {dealsQuery.isError ? (
        <ErrorState
          description="Offers are returned within your deal records."
          onRetry={() => void dealsQuery.refetch()}
          title="Offers unavailable"
        />
      ) : null}
      {dealsQuery.data && deals.length === 0 ? (
        <SectionCard>
          <WorkspaceEmpty
            action={
              <Button asChild variant="outline">
                <Link to="/seller/listings">Review listings</Link>
              </Button>
            }
            description="Offers appear here when a buyer begins an acquisition and submits a proposal."
            title="No deal offers yet"
          />
        </SectionCard>
      ) : null}
      {dealsQuery.data && deals.length ? (
        <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <SectionCard className="p-4 sm:p-4">
            <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-line px-3">
              <Search size={15} />
              <input
                aria-label="Search offers by business"
                className="w-full bg-transparent text-xs outline-none"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Business or deal"
                value={search}
              />
            </label>
            <nav aria-label="Acquisitions with offers" className="space-y-1">
              {filteredDeals.map((deal) => {
                const pending = offerQueries[
                  deals.indexOf(deal)
                ]?.data?.offers.some(
                  (item) =>
                    item.status === "pending" && item.created_by !== user?.id,
                );
                const listing = listingById.get(deal.listing_id);
                return (
                  <button
                    aria-current={selected?.id === deal.id ? "true" : undefined}
                    className={`w-full rounded-lg border p-3 text-left ${selected?.id === deal.id ? "border-emerald-700/20 bg-emerald-50" : "border-transparent hover:bg-mist"}`}
                    key={deal.id}
                    onClick={() => {
                      setParams({ deal: String(deal.id) });
                      setNotice("");
                      setError("");
                    }}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-navy-950">
                        {listing?.title ??
                          `Business listing #${deal.listing_id}`}
                      </span>
                      <StatusBadge status={deal.status} />
                    </span>
                    <span className="mt-1.5 flex items-center justify-between text-[0.68rem] text-ink-soft">
                      <span>Deal #{deal.id}</span>
                      {pending ? (
                        <span className="font-semibold text-emerald-800">
                          Response needed
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </nav>
            {dealsQuery.data.pagination.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <Button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <span className="text-[0.68rem] text-ink-soft">
                  Page {page} of {dealsQuery.data.pagination.totalPages}
                </span>
                <Button
                  disabled={page >= dealsQuery.data.pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            ) : null}
          </SectionCard>
          {selected ? (
            <div className="space-y-5">
              <SectionCard>
                <SectionHeading
                  description={`Deal #${selected.id} · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(selected.created_at))}`}
                  title={
                    listingById.get(selected.listing_id)?.title ??
                    `Business listing #${selected.listing_id}`
                  }
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-soft">Asking price</p>
                    <p className="mt-1 text-lg font-semibold text-navy-950">
                      {formatListingMoney(
                        listingById.get(selected.listing_id)?.askingPrice ??
                          null,
                        selectedListing?.currency ?? "",
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <Link
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"
                      to={`/seller/deals/${selected.id}`}
                    >
                      Open deal <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </SectionCard>
              {selectedOffersQuery?.isPending ? (
                <WorkspaceSkeleton rows={2} />
              ) : null}
              {selectedOffersQuery?.isError ? (
                <ErrorState
                  description="Negotiation history could not be loaded."
                  onRetry={() => void selectedOffersQuery.refetch()}
                  title="Offers unavailable"
                />
              ) : null}
              {selectedOffersQuery?.data ? (
                <SectionCard>
                  <SectionHeading
                    description="Historical records are immutable and ordered by submission time."
                    title="Negotiation history"
                  />
                  <OfferTimeline
                    currentUserId={user?.id ?? 0}
                    buyerId={selected.buyer_id}
                    offers={selectedOffersQuery.data.offers}
                  />
                </SectionCard>
              ) : null}
              {selectedOffersQuery?.data && negotiable.has(selected.status) ? (
                <SectionCard>
                  <SectionHeading
                    description="Counteroffers link to the latest pending proposal so the backend can enforce its negotiation rules."
                    title="Respond or counteroffer"
                  />
                  {incoming[0] && incoming[0].deal_id === selected.id ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-emerald-900">
                            Current buyer proposal
                          </p>
                          <p className="mt-1 text-lg font-semibold text-navy-950">
                            {formatListingMoney(
                              incoming[0].amount,
                              incoming[0].currency,
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            disabled={acceptMutation.isPending}
                            onClick={() =>
                              setConfirm({
                                dealId: selected.id,
                                offer: incoming[0],
                                kind: "accept",
                              })
                            }
                            size="sm"
                            variant="accent"
                          >
                            Accept
                          </Button>
                          <Button
                            disabled={acceptMutation.isPending}
                            onClick={() =>
                              setConfirm({
                                dealId: selected.id,
                                offer: incoming[0],
                                kind: "reject",
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                      {incoming[0].message ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-soft">
                          {incoming[0].message}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedListing ? (
                    <div className="mt-5">
                      <OfferComposer
                        askingPrice={selectedListing.askingPrice}
                        listingCurrency={selectedListing.currency}
                        disabled={
                          !negotiable.has(selected.status) ||
                          createOfferMutation.isPending
                        }
                        parentOfferId={
                          incoming[0]?.deal_id === selected.id
                            ? incoming[0].id
                            : undefined
                        }
                        onSubmit={async (input) => {
                          await createOfferMutation.mutateAsync(input);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      The listing’s currency and asking price are not included
                      in the seller records currently loaded, so an offer cannot
                      be composed here.
                    </p>
                  )}
                </SectionCard>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          busy={acceptMutation.isPending}
          confirmLabel={
            confirm.kind === "accept" ? "Accept offer" : "Reject offer"
          }
          description={
            confirm.kind === "accept"
              ? "Accepting this proposal is consequential. DealFlow will apply the permitted deal transition after the server confirms."
              : "Reject this proposal? The other deal participant will see the updated negotiation status."
          }
          error={
            acceptMutation.isError
              ? toApiError(acceptMutation.error).message
              : undefined
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => acceptMutation.mutate(confirm)}
          title={
            confirm.kind === "accept"
              ? "Accept this offer?"
              : "Reject this offer?"
          }
        />
      ) : null}
    </>
  );
}
