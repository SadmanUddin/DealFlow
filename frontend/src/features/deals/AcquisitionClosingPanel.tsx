import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CircleAlert,
  Clock3,
  Handshake,
  LockKeyhole,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SectionCard } from "@/components/shared/workspace/WorkspaceUI";
import { Button } from "@/components/ui/button";
import {
  formatSaleMoney,
  formatSoldDate,
} from "@/features/marketplace/marketplace-format";
import { toApiError } from "@/lib/api-error";
import {
  updateAcquisitionClosing,
  type ClosingAction,
  type Deal,
  type Offer,
} from "./api";

export function AcquisitionClosingPanel({
  deal,
  userId,
  acceptedOffer,
}: {
  deal: Deal;
  userId: number;
  acceptedOffer?: Offer;
}) {
  const client = useQueryClient();
  const offer = deal.agreed_offer ?? acceptedOffer;
  const revision = deal.closing_revision ?? 0;
  const [amount, setAmount] = useState(
    deal.closing_amount ?? offer?.amount ?? "",
  );
  const [dialog, setDialog] = useState<{
    action: "confirm" | "dispute" | "resolve";
    revision: number;
    reviewedPrice: string | null;
  } | null>(null);
  const [consent, setConsent] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: ClosingAction) =>
      updateAcquisitionClosing(deal.id, input),
    onSuccess: async (updated) => {
      client.setQueryData(["deals", deal.id], updated);
      setDialog(null);
      setConsent(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["deals"] }),
        client.invalidateQueries({ queryKey: ["marketplace"] }),
        client.invalidateQueries({ queryKey: ["seller", "listings"] }),
        client.invalidateQueries({ queryKey: ["buyer", "notifications"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
  const completed = deal.status === "completed";
  const finalPrice =
    deal.closing_amount && deal.closing_currency
      ? formatSaleMoney(deal.closing_amount, deal.closing_currency)
      : null;
  const disputed = Boolean(deal.closing_disputed_by);
  const agreed = Boolean(deal.closing_agreed_at);
  const confirmations =
    Number(Boolean(deal.buyer_confirmed_at)) +
    Number(Boolean(deal.seller_confirmed_at));
  const ownConfirmed =
    userId === deal.buyer_id
      ? deal.buyer_confirmed_at
      : deal.seller_confirmed_at;
  const dialogOutdated = Boolean(
    dialog &&
    (dialog.revision !== revision ||
      completed ||
      (dialog.action === "confirm" && ownConfirmed)),
  );
  const error = mutation.isError ? toApiError(mutation.error).message : "";
  const ask = (action: "confirm" | "dispute" | "resolve") => {
    mutation.reset();
    setConsent(false);
    setDialog({ action, revision, reviewedPrice: finalPrice });
  };
  const dialogText = {
    confirm: {
      title: "Confirm acquisition completion",
      description: `Confirm that the acquisition is complete at ${dialog?.reviewedPrice ?? "the agreed amount"}. When both parties confirm, this listing will be marked sold.`,
      button: "Confirm completion",
    },
    dispute: {
      title: "Report a closing dispute",
      description:
        "Closing will pause and any confirmations will be cleared. The other participant will be notified. Use your private conversation to work through the issue.",
      button: "Pause closing",
    },
    resolve: {
      title: "Resolve the closing dispute",
      description:
        "Continue once you have resolved the issue with the other participant. Both parties will need to agree on the terms and confirm completion again.",
      button: "Resolve dispute",
    },
  };

  return (
    <SectionCard className="border-emerald-200">
      <header className="mb-6 flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white">
          {completed ? (
            <BadgeCheck size={21} aria-hidden="true" />
          ) : (
            <Handshake size={21} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-3xl leading-tight tracking-[-0.035em] text-navy-950">
            {completed ? "Acquisition Completed" : "Complete Acquisition"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
            {completed
              ? deal.completed_at
                ? "Both parties confirmed completion. DealFlow now shows this business as sold."
                : "This deal was completed before DealFlow recorded separate confirmations."
              : "Once the transaction is complete outside DealFlow, agree on the final amount and confirm separately."}
          </p>
        </div>
      </header>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <dt className="text-xs font-medium text-ink-soft">Accepted offer</dt>
          <dd className="mt-1 break-words text-xl font-semibold tabular-nums tracking-tight text-navy-950 sm:text-2xl">
            {offer
              ? formatSaleMoney(offer.amount, offer.currency)
              : "Unavailable"}
          </dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-emerald-900 p-4 text-white sm:p-5">
          <dt className="text-sm font-medium text-white/90">
            {agreed ? "Final closing amount" : "Proposed closing amount"}
          </dt>
          <dd className="mt-1 break-words text-xl font-semibold tabular-nums tracking-tight text-white sm:text-2xl">
            {finalPrice ?? "Awaiting proposal"}
          </dd>
        </div>
      </dl>
      <div className="mt-5 rounded-2xl border border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-navy-950">
            Closing progress
          </p>
          <span className="text-xs font-medium text-ink-soft">
            {confirmations} of 2 confirmed
          </span>
        </div>
        <progress
          className="mt-3 h-2 w-full appearance-none overflow-hidden rounded-full bg-mist [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-emerald-800 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-mist [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-800"
          aria-label="Closing confirmations"
          value={confirmations}
          max={2}
        />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Buyer", deal.buyer_confirmed_at],
              ["Seller", deal.seller_confirmed_at],
            ] as const
          ).map(([role, confirmed]) => (
            <li
              key={role}
              className="flex min-w-0 items-start gap-2 rounded-xl bg-paper p-3 text-sm text-ink-soft"
            >
              {confirmed ? (
                <BadgeCheck
                  size={16}
                  aria-hidden="true"
                  className="text-emerald-800"
                />
              ) : (
                <Clock3 size={16} aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block font-semibold text-navy-950">
                  {role}
                </span>
                <span className="mt-0.5 block text-xs">
                  {confirmed
                    ? `Confirmed ${formatSoldDate(confirmed)}`
                    : "Awaiting confirmation"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {completed && deal.completed_at ? (
        <p
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950"
          role="status"
        >
          <BadgeCheck aria-hidden="true" size={17} />
          Completed {formatSoldDate(deal.completed_at)} ·{" "}
          {deal.buyer_price_consent && deal.seller_price_consent
            ? "Sale price publicly visible"
            : "Sale price private"}
        </p>
      ) : null}
      {!completed && disputed ? (
        <div
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert size={16} aria-hidden="true" /> Closing paused
          </p>
          <p className="mt-1">
            The{" "}
            {deal.closing_disputed_by === deal.buyer_id ? "buyer" : "seller"}{" "}
            reported a dispute. Use the private conversation to resolve it. The
            participant who raised it can then resume closing.
          </p>
          {deal.closing_disputed_by === userId && (
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => ask("resolve")}
            >
              Resolve dispute
            </Button>
          )}
        </div>
      ) : null}
      {!completed && !disputed ? (
        <div className="mt-5 space-y-4">
          {!agreed && (
            <form
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-paper p-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({ action: "propose", amount, revision });
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium text-navy-950">
                Propose closing amount {offer ? `(${offer.currency})` : ""}
                <input
                  className="h-11 min-w-0 max-w-full rounded-lg border border-line bg-white px-3 tabular-nums focus-visible:outline-2 focus-visible:outline-emerald-800"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  pattern="[0-9]{1,16}([.][0-9]{1,2})?"
                  required
                />
              </label>
              <Button
                disabled={mutation.isPending || !offer}
                type="submit"
                variant="outline"
              >
                Send proposal
              </Button>
            </form>
          )}
          {finalPrice && !agreed ? (
            <p className="text-sm text-ink-soft">
              {deal.closing_proposed_by === userId
                ? "Waiting for the other participant to agree."
                : "Review the proposed amount before agreeing."}
            </p>
          ) : null}
          {agreed && ownConfirmed ? (
            <p className="text-sm text-ink-soft" role="status">
              You confirmed completion. Waiting for the other participant.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {finalPrice && !agreed && deal.closing_proposed_by !== userId && (
              <Button
                disabled={mutation.isPending}
                variant="accent"
                className="bg-emerald-900 text-white hover:bg-emerald-950"
                onClick={() => mutation.mutate({ action: "agree", revision })}
              >
                <Handshake size={16} aria-hidden="true" /> Agree to {finalPrice}
              </Button>
            )}
            {agreed && !ownConfirmed && (
              <Button
                disabled={mutation.isPending}
                variant="accent"
                className="bg-emerald-900 text-white hover:bg-emerald-950"
                onClick={() => ask("confirm")}
              >
                Confirm completion
              </Button>
            )}
            <Button
              disabled={mutation.isPending}
              variant="outline"
              onClick={() => ask("dispute")}
            >
              Report a dispute
            </Button>
          </div>
        </div>
      ) : null}
      {error && !dialog && (
        <p role="alert" className="mt-3 text-sm text-rose-900">
          {error}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() =>
              void client.invalidateQueries({ queryKey: ["deals", deal.id] })
            }
          >
            Refresh deal
          </button>
        </p>
      )}
      {dialog && (
        <ConfirmDialog
          title={dialogText[dialog.action].title}
          description={dialogText[dialog.action].description}
          confirmLabel={dialogText[dialog.action].button}
          busy={mutation.isPending}
          error={
            dialogOutdated && !mutation.isPending
              ? "Closing has changed. Dismiss this dialog and review the latest status."
              : error
          }
          confirmDisabled={dialogOutdated}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            mutation.mutate(
              dialog.action === "confirm"
                ? {
                    action: "confirm",
                    revision: dialog.revision,
                    publicPriceConsent: consent,
                  }
                : { action: dialog.action, revision: dialog.revision },
            );
          }}
        >
          {dialog.action === "confirm" && (
            <label className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-900"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                <span className="mb-1 flex items-center gap-1.5 font-semibold">
                  <LockKeyhole aria-hidden="true" size={14} /> Public sale price
                </span>
                I consent to DealFlow publishing the final sale price if the
                other participant also consents.
              </span>
            </label>
          )}
        </ConfirmDialog>
      )}
    </SectionCard>
  );
}
