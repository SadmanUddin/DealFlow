import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import {
  getMyListing,
  createListing,
  updateListing,
  type ListingInput,
  uploadListingImage,
  removeListingImage,
} from "./api";
import { toApiError } from "@/lib/api-error";
import { listingImageSrc } from "@/features/marketplace/listing-image-url";

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
  website: z
    .string()
    .trim()
    .url("Enter a valid website URL.")
    .refine(
      (value) =>
        !value || ["http:", "https:"].includes(new URL(value).protocol),
      "Website must use HTTPS or HTTP.",
    )
    .or(z.literal("")),
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
  website: "",
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
  if (
    rawId &&
    (!id || !Number.isSafeInteger(id) || id < 1 || String(id) !== rawId)
  ) {
    return (
      <ErrorState
        title="Listing not found"
        description="Choose a listing from your seller workspace."
      />
    );
  }
  return <ListingEditor key={rawId ?? "new"} id={id} />;
}

function ListingEditor({ id }: { id?: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmRemoveImage, setConfirmRemoveImage] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank,
    mode: "onBlur",
  });
  const listingQuery = useQuery({
    queryKey: ["seller", "listings", "detail", id],
    queryFn: () => getMyListing(id!),
    enabled: Boolean(id),
  });
  const listing = listingQuery.data?.listing;
  const { dirtyFields, isDirty } = form.formState;
  useEffect(() => {
    if (!listing) return;
    form.reset(
      {
        title: listing.title,
        description: listing.description,
        industry: listing.industry ?? "",
        location: listing.location ?? "",
        website: listing.website ?? "",
        asking_price: listing.askingPrice ?? "",
        annual_revenue: listing.annualRevenue ?? "",
        ebitda: listing.ebitda ?? "",
        currency: listing.currency,
      },
      { keepDirtyValues: true },
    );
  }, [form, listing]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDirty]);
  const save = useMutation({
    mutationFn: (input: ListingInput) =>
      id ? updateListing(id, input) : createListing(input),
    onSuccess: async ({ listing: savedListing }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["seller", "listings"] }),
        client.invalidateQueries({ queryKey: ["marketplace"] }),
      ]);
      navigate(
        id ? "/seller/listings" : `/seller/listings/${savedListing.id}/edit`,
        {
          replace: true,
          state: {
            listingNotice: !id
              ? "Draft saved. You can now add a listing image."
              : savedListing.status === "pending"
                ? "Changes saved and sent for review."
                : "Changes saved.",
          },
        },
      );
    },
  });
  const imageUpload = useMutation({
    mutationFn: (file: File) => uploadListingImage(id!, file),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seller", "listings"] });
      await client.invalidateQueries({ queryKey: ["marketplace"] });
    },
  });
  const imageRemoval = useMutation({
    mutationFn: () => removeListingImage(id!),
    onSuccess: async () => {
      setConfirmRemoveImage(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["seller", "listings"] }),
        client.invalidateQueries({ queryKey: ["marketplace"] }),
        client.invalidateQueries({ queryKey: ["buyer", "favorites"] }),
      ]);
    },
  });
  const submit = form.handleSubmit((values) => {
    save.mutate({
      title: values.title,
      description: values.description,
      industry: values.industry || null,
      location: values.location || null,
      website: values.website || null,
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
  const canEditImage = Boolean(
    listing &&
    ["draft", "pending", "rejected", "published"].includes(listing.status),
  );

  if (id && listingQuery.isPending) return <WorkspaceSkeleton rows={4} />;
  if (id && listingQuery.isError && !listing)
    return (
      <ErrorState
        error={listingQuery.error}
        description="The listing could not be loaded for editing."
        onRetry={() => void listingQuery.refetch()}
        title="Listing unavailable"
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
      {location.state?.listingNotice && (
        <p
          className="mb-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {location.state.listingNotice}
        </p>
      )}
      {listing ? (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">
          <StatusBadge status={listing.status} />
          {listing.status === "published"
            ? "Saving edits or changing its image sends the listing back to moderation."
            : listing.status === "pending"
              ? "This listing is awaiting review. You can replace or remove its image; other listing changes remain locked until review is complete."
              : null}
        </div>
      ) : null}
      {save.isError ? (
        <p
          className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {toApiError(save.error).message}
        </p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <form
          className="min-w-0 space-y-5"
          noValidate
          onSubmit={submit}
          aria-busy={save.isPending}
        >
          <p className="text-sm text-ink-soft">
            Fields marked with an asterisk are required.
          </p>
          <SectionCard id="listing-overview" className="scroll-mt-28">
            <SectionHeading
              description="Keep the title concise and describe the business as it operates today."
              title="Business overview"
            />
            <div className="mt-5 grid gap-5">
              <Field
                disabled={locked}
                errors={form.formState.errors.title?.message}
                label="Business name"
                name="title"
                required
                register={form.register("title")}
              />
              <div>
                <label className={labelClass} htmlFor="description">
                  Business description <span aria-hidden="true">*</span>
                </label>
                <textarea
                  aria-describedby={
                    form.formState.errors.description
                      ? "description-help description-error"
                      : "description-help"
                  }
                  aria-invalid={Boolean(form.formState.errors.description)}
                  required
                  className={textareaClass}
                  disabled={locked}
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
          <SectionCard id="listing-category" className="scroll-mt-28">
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
                disabled={locked}
              />
              <Field
                errors={form.formState.errors.location?.message}
                label="Location"
                name="location"
                register={form.register("location")}
                disabled={locked}
              />
              <Field
                errors={form.formState.errors.website?.message}
                label="Business website"
                name="website"
                register={form.register("website")}
                disabled={locked}
                type="url"
              />
            </div>
          </SectionCard>
          <SectionCard id="listing-financials" className="scroll-mt-28">
            <SectionHeading
              description="Use the same currency for all amounts. Enter digits with a decimal point for cents, for example 125000.50. Leave an amount blank if you do not have it."
              title="Asking price and financials"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="currency">
                  Currency <span aria-hidden="true">*</span>
                </label>
                <select
                  className={inputClass}
                  disabled={locked}
                  id="currency"
                  required
                  aria-invalid={Boolean(form.formState.errors.currency)}
                  aria-describedby={
                    form.formState.errors.currency
                      ? "currency-error"
                      : undefined
                  }
                  {...form.register("currency")}
                >
                  {listing && !currencySet.has(listing.currency) && (
                    <option value={listing.currency} disabled>
                      {listing.currency} (select a supported currency)
                    </option>
                  )}
                  {[...currencySet].sort().map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                <FieldError id="currency-error">
                  {form.formState.errors.currency?.message}
                </FieldError>
              </div>
              <Field
                errors={form.formState.errors.asking_price?.message}
                label="Asking price"
                name="asking_price"
                inputMode="decimal"
                register={form.register("asking_price")}
                disabled={locked}
                type="text"
              />
              <Field
                errors={form.formState.errors.annual_revenue?.message}
                label="Annual revenue"
                name="annual_revenue"
                inputMode="decimal"
                register={form.register("annual_revenue")}
                disabled={locked}
                type="text"
              />
              <Field
                errors={form.formState.errors.ebitda?.message}
                label="EBITDA"
                name="ebitda"
                inputMode="decimal"
                register={form.register("ebitda")}
                disabled={locked}
                type="text"
              />
            </div>
          </SectionCard>
          {id && listing ? (
            <SectionCard id="listing-media" className="scroll-mt-28">
              <SectionHeading
                title="Listing image"
                description="Choose a JPEG, PNG, or WebP file up to 5 MB for your public listing."
              />
              {listing.imageUrl && failedPreviewUrl !== listing.imageUrl ? (
                <img
                  className="mt-4 aspect-[2/1] max-h-64 w-full rounded-xl object-cover"
                  src={listingImageSrc(listing.imageUrl)}
                  alt={`Listing image for ${listing.title}`}
                  onError={() => setFailedPreviewUrl(listing.imageUrl ?? null)}
                  crossOrigin="use-credentials"
                />
              ) : listing.imageUrl ? (
                <p className="mt-4 text-sm text-rose-800" role="alert">
                  The uploaded image could not be previewed. Try uploading it
                  again.
                </p>
              ) : (
                <p className="mt-4 text-sm text-ink-soft">
                  A category illustration will appear until you add a photo.
                </p>
              )}
              <label
                className="mt-4 block text-sm font-medium"
                htmlFor="listing-image"
              >
                Upload or replace image
              </label>
              <input
                id="listing-image"
                className="mt-2 block w-full min-w-0 rounded-xl border border-dashed border-line bg-paper p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-emerald-900"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  save.isPending ||
                  imageUpload.isPending ||
                  imageRemoval.isPending ||
                  !canEditImage
                }
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) imageUpload.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
              {imageUpload.isPending ? (
                <p role="status" className="mt-2 text-sm text-ink-soft">
                  Uploading image…
                </p>
              ) : null}
              {imageUpload.isError ? (
                <p role="alert" className="mt-2 text-sm text-rose-800">
                  {toApiError(imageUpload.error).message}
                </p>
              ) : null}
              {imageUpload.isSuccess ? (
                <p role="status" className="mt-2 text-sm text-emerald-800">
                  {imageUpload.data.status === "pending"
                    ? "Image uploaded. This listing remains pending moderation; the updated image will be public after approval."
                    : "Image uploaded."}
                </p>
              ) : null}
              {listing.imageUrl ? (
                <Button
                  className="mt-3"
                  disabled={
                    save.isPending ||
                    imageUpload.isPending ||
                    imageRemoval.isPending ||
                    !canEditImage
                  }
                  onClick={() => setConfirmRemoveImage(true)}
                  type="button"
                  variant="outline"
                >
                  {imageRemoval.isPending ? "Removing image…" : "Remove image"}
                </Button>
              ) : null}
              {imageRemoval.isError ? (
                <p className="mt-2 text-sm text-rose-800" role="alert">
                  {toApiError(imageRemoval.error).message}
                </p>
              ) : null}
              {imageRemoval.isSuccess ? (
                <p className="mt-2 text-sm text-emerald-800" role="status">
                  Image removed.
                  {imageRemoval.data.status === "pending"
                    ? " The listing remains pending moderation."
                    : ""}
                </p>
              ) : null}
            </SectionCard>
          ) : (
            <SectionCard id="listing-media" className="scroll-mt-28">
              <SectionHeading
                title="Listing image"
                description="Save your draft to upload an optional business photo."
              />
            </SectionCard>
          )}
          {locked ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              This listing is {listing?.status} and its business details cannot
              be edited until its status changes. Image replacement and removal
              remain available while it is pending review.
            </p>
          ) : (
            <SectionCard>
              <SectionHeading
                title="Review and save"
                description={
                  listing?.status === "published"
                    ? "Saving sends this listing back to the review queue."
                    : "Save your changes here. Submit the listing for review from Your listings when it is ready."
                }
              />
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button asChild variant="outline">
                  <Link to="/seller/listings">Cancel</Link>
                </Button>
                <Button
                  disabled={
                    save.isPending ||
                    imageUpload.isPending ||
                    imageRemoval.isPending ||
                    !Object.keys(dirtyFields).length
                  }
                  type="submit"
                  variant="accent"
                >
                  <Save size={16} />
                  {save.isPending
                    ? "Saving…"
                    : listing?.status === "published"
                      ? "Save and send for review"
                      : id
                        ? "Save changes"
                        : "Save draft"}
                </Button>
              </div>
            </SectionCard>
          )}
        </form>
        <aside
          aria-label="Listing form sections"
          className="order-first xl:order-last"
        >
          <nav className="flex flex-wrap gap-1 rounded-xl border border-line bg-white p-2 xl:sticky xl:top-24 xl:flex-col">
            <a className={sectionLink} href="#listing-overview">
              Overview
            </a>
            <a className={sectionLink} href="#listing-category">
              Category &amp; location
            </a>
            <a className={sectionLink} href="#listing-financials">
              Financials
            </a>
            <a className={sectionLink} href="#listing-media">
              Listing image
            </a>
          </nav>
        </aside>
      </div>
      {confirmRemoveImage ? (
        <ConfirmDialog
          title="Remove listing image?"
          description={
            listing?.status === "published"
              ? "The image will stop appearing publicly and this listing will return to moderation."
              : "The image will be removed from this listing."
          }
          confirmLabel="Remove image"
          busyLabel="Removing image…"
          busy={imageRemoval.isPending}
          error={
            imageRemoval.isError
              ? toApiError(imageRemoval.error).message
              : undefined
          }
          onCancel={() => setConfirmRemoveImage(false)}
          onConfirm={() => imageRemoval.mutate()}
        />
      ) : null}
    </>
  );
}

function Field({
  label,
  name,
  register,
  errors,
  type = "text",
  inputMode,
  required,
  disabled = false,
}: {
  label: string;
  name: string;
  register: React.InputHTMLAttributes<HTMLInputElement>;
  errors?: string;
  type?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  disabled?: boolean;
}) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        aria-describedby={errors ? errorId : undefined}
        aria-invalid={Boolean(errors)}
        required={required}
        inputMode={inputMode}
        className={inputClass}
        id={name}
        type={type}
        disabled={disabled}
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

const sectionLink =
  "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-paper hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-emerald-800";
