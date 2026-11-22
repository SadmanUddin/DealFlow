import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch } from "react-hook-form";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  formatListingMoney,
  formatSaleMoney,
} from "@/features/marketplace/marketplace-format";
import { toApiError } from "@/lib/api-error";

const currencyCodes = new Set(
  "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG".split(
    " ",
  ),
);

const offerFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(
      /^\d{1,16}(\.\d{1,2})?$/,
      "Enter an amount with up to two decimal places.",
    )
    .refine(
      (value) => Number(value) > 0,
      "Offer amount must be greater than zero.",
    ),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => currencyCodes.has(value),
      "Choose a supported ISO 4217 currency code.",
    ),
  message: z
    .string()
    .trim()
    .max(5000, "Message must be 5,000 characters or fewer.")
    .optional(),
});
type OfferFormValues = z.infer<typeof offerFormSchema>;

export function OfferComposer({
  askingPrice,
  listingCurrency,
  parentOfferId,
  onSubmit,
  disabled = false,
  confirmBeforeSubmit = false,
}: {
  askingPrice: string | null;
  listingCurrency: string;
  parentOfferId?: number;
  disabled?: boolean;
  confirmBeforeSubmit?: boolean;
  onSubmit: (input: {
    amount: string;
    currency: string;
    message?: string;
    parentOfferId?: number;
  }) => Promise<void>;
}) {
  const [apiError, setApiError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<OfferFormValues | null>(
    null,
  );
  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: { amount: "", currency: listingCurrency, message: "" },
  });
  const amount = useWatch({ control: form.control, name: "amount" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const message = useWatch({ control: form.control, name: "message" });

  const submitValues = async (values: OfferFormValues) => {
    if (submitting) return false;
    setSubmitting(true);
    setApiError("");
    setSaved(false);
    try {
      await onSubmit({
        amount: values.amount,
        currency: values.currency.toUpperCase(),
        ...(values.message?.trim() ? { message: values.message.trim() } : {}),
        ...(parentOfferId ? { parentOfferId } : {}),
      });
      form.reset({ amount: "", currency: listingCurrency, message: "" });
      setSaved(true);
      setConfirmation(null);
      return true;
    } catch (error) {
      setApiError(toApiError(error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };
  const submit = form.handleSubmit(async (values) => {
    if (confirmBeforeSubmit) {
      setApiError("");
      setConfirmation(values);
      return;
    }
    await submitValues(values);
  });

  return (
    <>
      <form className="space-y-4" noValidate onSubmit={submit}>
        <div className="rounded-2xl border border-line bg-paper px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Current asking price
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-navy-950">
            {formatListingMoney(askingPrice, listingCurrency)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
          <div>
            <label
              className="mb-1.5 block text-xs font-semibold text-navy-950"
              htmlFor="offer-amount"
            >
              {parentOfferId ? "Counteroffer amount" : "Offer amount"}
            </label>
            <input
              aria-describedby={
                form.formState.errors.amount ? "offer-amount-error" : undefined
              }
              aria-invalid={Boolean(form.formState.errors.amount)}
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base sm:text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
              id="offer-amount"
              inputMode="decimal"
              onChange={(event) =>
                form.setValue("amount", event.target.value, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="0.00"
              value={amount}
            />
            {form.formState.errors.amount ? (
              <p className="mt-1 text-xs text-rose-800" id="offer-amount-error">
                {form.formState.errors.amount.message}
              </p>
            ) : null}
          </div>
          <div>
            <label
              className="mb-1.5 block text-xs font-semibold text-navy-950"
              htmlFor="offer-currency"
            >
              Currency
            </label>
            <input
              aria-describedby={
                form.formState.errors.currency
                  ? "offer-currency-error"
                  : "offer-currency-help"
              }
              aria-invalid={Boolean(form.formState.errors.currency)}
              className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base sm:text-sm uppercase outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
              id="offer-currency"
              maxLength={3}
              onChange={(event) =>
                form.setValue("currency", event.target.value.toUpperCase(), {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              value={currency}
            />
            <p
              className="mt-1 text-[0.65rem] text-ink-faint"
              id="offer-currency-help"
            >
              ISO 4217
            </p>
            {form.formState.errors.currency ? (
              <p
                className="mt-1 text-xs text-rose-800"
                id="offer-currency-error"
              >
                {form.formState.errors.currency.message}
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <label
            className="mb-1.5 block text-xs font-semibold text-navy-950"
            htmlFor="offer-message"
          >
            Terms or note{" "}
            <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            aria-invalid={Boolean(form.formState.errors.message)}
            className="min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-sm leading-5 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
            id="offer-message"
            maxLength={5000}
            onChange={(event) =>
              form.setValue("message", event.target.value, {
                shouldValidate: form.formState.isSubmitted,
              })
            }
            placeholder="Share context for this proposal."
            value={message}
          />
          <div className="mt-1 flex justify-between text-[0.65rem] text-ink-faint">
            {form.formState.errors.message ? (
              <p className="text-rose-800">
                {form.formState.errors.message.message}
              </p>
            ) : (
              <span>Visible to the other deal participant</span>
            )}
            <span>{message?.length ?? 0}/5000</span>
          </div>
        </div>
        {apiError && !confirmation ? (
          <p
            className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900"
            role="alert"
          >
            {apiError}
          </p>
        ) : null}
        {saved ? (
          <p
            className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
            role="status"
          >
            Your offer was submitted.
          </p>
        ) : null}
        <Button
          disabled={disabled || submitting || form.formState.isSubmitting}
          type="submit"
          variant="accent"
        >
          {submitting || form.formState.isSubmitting
            ? "Submitting…"
            : parentOfferId
              ? "Submit counteroffer"
              : "Submit offer"}
        </Button>
      </form>
      {confirmation ? (
        <ConfirmDialog
          busy={submitting || form.formState.isSubmitting}
          busyLabel="Submitting offer…"
          confirmLabel={parentOfferId ? "Submit counteroffer" : "Submit offer"}
          description="Review these terms before sending them to the other deal participant."
          error={apiError || undefined}
          onCancel={() => {
            if (!form.formState.isSubmitting) setConfirmation(null);
          }}
          onConfirm={() => void submitValues(confirmation)}
          title={parentOfferId ? "Confirm counteroffer" : "Confirm offer"}
        >
          <dl className="grid gap-3 rounded-xl bg-paper p-4 text-sm">
            <div>
              <dt className="text-xs text-ink-soft">Amount</dt>
              <dd className="mt-1 font-semibold text-navy-950">
                {formatSaleMoney(confirmation.amount, confirmation.currency)}
              </dd>
            </div>
            {confirmation.message?.trim() ? (
              <div>
                <dt className="text-xs text-ink-soft">Message or terms</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm leading-5 text-navy-950">
                  {confirmation.message.trim()}
                </dd>
              </div>
            ) : null}
          </dl>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
