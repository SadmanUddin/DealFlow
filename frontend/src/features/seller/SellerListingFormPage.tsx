import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import {
  listMyListings,
  createListing,
  updateListing,
  type ListingInput,
} from "./api";
import { toApiError } from "@/lib/api-error";

const currencySet = new Set(Intl.supportedValuesOf("currency"));
const amount = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{1,16}(\.\d{1,2})?$/.test(value),
    "Enter a non-negative amount with up to two decimal places.",
  );
const schema = z.object({
  title: z.string().trim().min(3, "Enter at least 3 characters.").max(200),
  description: z
    .string()
    .trim()
    .min(20, "Add at least 20 characters.")
    .max(10000),
  industry: z.string().trim().max(120),
  location: z.string().trim().max(160),
  asking_price: amount,
  annual_revenue: amount,
  ebitda: amount,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => currencySet.has(value),
      "Use a supported three-letter ISO currency code.",
    ),
});
type FormValues = z.infer<typeof schema>;
const blank: FormValues = {
  title: "",
  description: "",
  industry: "",
  location: "",
  asking_price: "",
  annual_revenue: "",
  ebitda: "",
  currency: "EUR",
};
const labelClass = "mb-1.5 block text-sm font-semibold text-navy-950";
const inputClass =
  "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-950 outline-none transition placeholder:text-ink-faint focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10";
const textareaClass =
  "min-h-36 w-full resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm leading-6 text-navy-950 outline-none transition placeholder:text-ink-faint focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10";

export function SellerListingFormPage() {
  const { id: rawId } = useParams();
  const id = rawId ? Number(rawId) : undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank,
    mode: "onBlur",
  });
  const listingsQuery = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    enabled: Boolean(id),
  });
  const listing = listingsQuery.data?.listings.find((item) => item.id === id);
  useEffect(() => {
    if (!listing) return;
    form.reset({
      title: listing.title,
      description: listing.description,
      industry: listing.industry ?? "",
      location: listing.location ?? "",
      asking_price: listing.askingPrice ?? "",
      annual_revenue: listing.annualRevenue ?? "",
      ebitda: listing.ebitda ?? "",
      currency: listing.currency,
    });
  }, [form, listing]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [form.formState.isDirty]);
  const save = useMutation({
    mutationFn: (input: ListingInput) =>
      id ? updateListing(id, input) : createListing(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seller", "listings"] });
      navigate("/seller/listings", { replace: true });
    },
  });
  const submit = form.handleSubmit((values) => {
    save.mutate({
      title: values.title,
      description: values.description,
      industry: values.industry || null,
      location: values.location || null,
      asking_price: values.asking_price || null,
      annual_revenue: values.annual_revenue || null,
      ebitda: values.ebitda || null,
      currency: values.currency.toUpperCase(),
    });
  });
  const locked = Boolean(
    id &&
    listing &&
    !["draft", "rejected", "published"].includes(listing.status),
  );

  if (id && listingsQuery.isPending) return <WorkspaceSkeleton rows={4} />;
  if (id && listingsQuery.isError)
    return (
      <ErrorState
        error={listingsQuery.error}
        description="The listing could not be loaded for editing."
        onRetry={() => void listingsQuery.refetch()}
        title="Listing unavailable"
      />
    );
  if (id && !listing && listingsQuery.data)
    return (
      <ErrorState
        description="Only your own listing records are available in the seller workspace."
        title="Listing not found"
      />
    );

  return (
    <>
      <Link
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
        to="/seller/listings"
      >
        <ArrowLeft size={16} /> All listings
      </Link>
      <WorkspacePageHeader
        description="A clear, accurate profile gives buyers the context they need to assess your business."
        eyebrow="Seller workspace · Listing editor"
        title={id ? "Edit business listing" : "Create business listing"}
      />
      {listing ? (
        <p className="mb-5 text-sm text-ink-soft">
          Current status:{" "}
          <strong className="text-navy-950">
            {listing.status.replaceAll("_", " ")}
          </strong>
          {listing.status === "published"
            ? " · Saving edits sends the listing back to moderation."
            : ""}
        </p>
      ) : null}
      {save.isError ? (
        <p
          className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {toApiError(save.error).message}
        </p>
      ) : null}
      <form className="space-y-5" noValidate onSubmit={submit}>
        <SectionCard>
          <SectionHeading
            description="Keep the title concise and describe the business as it operates today."
            title="Business overview"
          />
          <div className="mt-5 grid gap-5">
            <Field
              errors={form.formState.errors.title?.message}
              label="Business name"
              name="title"
              register={form.register("title")}
            />
            <div>
              <label className={labelClass} htmlFor="description">
                Business description
              </label>
              <textarea
                aria-describedby="description-help description-error"
                className={textareaClass}
                id="description"
                maxLength={10000}
                {...form.register("description")}
              />
              <p
                className="mt-1.5 text-xs text-ink-faint"
                id="description-help"
              >
                Describe the business, its customers, operations and
                opportunity.
              </p>
              <FieldError id="description-error">
                {form.formState.errors.description?.message}
              </FieldError>
            </div>
          </div>
        </SectionCard>
        <SectionCard>
          <SectionHeading
            description="Only share information you are comfortable disclosing in a public listing."
            title="Category and location"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              errors={form.formState.errors.industry?.message}
              label="Industry / category"
              name="industry"
              register={form.register("industry")}
            />
            <Field
              errors={form.formState.errors.location?.message}
              label="Location"
              name="location"
              register={form.register("location")}
            />
          </div>
        </SectionCard>
        <SectionCard>
          <SectionHeading
            description="Enter values in the selected currency. Financial details are optional when unavailable."
            title="Asking price and financials"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="currency">
                Currency
              </label>
              <select
                className={inputClass}
                disabled={locked}
                id="currency"
                {...form.register("currency")}
              >
                {[...currencySet].sort().map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <FieldError>{form.formState.errors.currency?.message}</FieldError>
            </div>
            <Field
              errors={form.formState.errors.asking_price?.message}
              label="Asking price"
              name="asking_price"
              register={form.register("asking_price")}
              type="text"
            />
            <Field
              errors={form.formState.errors.annual_revenue?.message}
              label="Annual revenue"
              name="annual_revenue"
              register={form.register("annual_revenue")}
              type="text"
            />
            <Field
              errors={form.formState.errors.ebitda?.message}
              label="EBITDA"
              name="ebitda"
              register={form.register("ebitda")}
              type="text"
            />
          </div>
        </SectionCard>
        {locked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            This listing is {listing?.status} and cannot be edited until its
            status changes.
          </p>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link to="/seller/listings">Cancel</Link>
            </Button>
            <Button
              disabled={save.isPending || !form.formState.isDirty}
              type="submit"
              variant="accent"
            >
              <Save size={16} />
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

function Field({
  label,
  name,
  register,
  errors,
  type = "text",
}: {
  label: string;
  name: string;
  register: React.InputHTMLAttributes<HTMLInputElement>;
  errors?: string;
  type?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      <input
        aria-describedby={errors ? errorId : undefined}
        className={inputClass}
        id={name}
        type={type}
        {...register}
      />
      <FieldError id={errorId}>{errors}</FieldError>
    </div>
  );
}
function FieldError({ children, id }: { children?: string; id?: string }) {
  return children ? (
    <p className="mt-1.5 text-xs text-rose-800" id={id} role="alert">
      {children}
    </p>
  ) : null;
}
