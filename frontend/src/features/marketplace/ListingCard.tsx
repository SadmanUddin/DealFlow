import { MapPin } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import type { PublicListing } from "./marketplace-api";
import { PublicSalePrice, SoldBadge } from "./SoldListingPresentation";
import { formatListingMoney, formatSoldDate } from "./marketplace-format";
import { ListingMedia } from "./ListingMedia";

export function ListingCard({ listing }: { listing: PublicListing }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl =
    listing.imageUrl && failedImageUrl !== listing.imageUrl
      ? listing.imageUrl
      : null;
  const sold = listing.status === "sold";
  const financials = [
    ["Asking price", listing.askingPrice],
    ["Annual revenue", listing.annualRevenue],
    ...(listing.ebitda != null ? [["EBITDA", listing.ebitda] as const] : []),
  ] as const;

  return (
    <Card className="group h-full overflow-hidden rounded-2xl border-line bg-white shadow-none transition-[border-color,box-shadow] duration-200 hover:border-emerald-800/50 hover:shadow-card">
      <Link
        aria-label={`View ${listing.title}`}
        className="flex h-full flex-col rounded-[inherit] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-emerald-700/40"
        to={`/listings/${listing.id}`}
      >
        <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-mist">
          <ListingMedia
            industry={listing.industry}
            title={listing.title}
            imageUrl={imageUrl}
            onImageError={() => setFailedImageUrl(listing.imageUrl ?? null)}
          />
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
            {sold ? (
              <SoldBadge />
            ) : (
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 shadow-sm">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-emerald-700"
                />{" "}
                Available
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          {listing.industry && (
            <p className="mb-2 break-words text-xs font-semibold tracking-wide text-emerald-900">
              {listing.industry}
            </p>
          )}
          <h3 className="break-words font-display text-[1.65rem] leading-[1.05] text-navy-950 group-hover:text-emerald-900">
            {listing.title}
          </h3>
          <p className="mt-2 flex items-center gap-1.5 break-words text-sm text-ink-soft">
            <MapPin
              aria-hidden="true"
              className="shrink-0 text-emerald-800"
              size={15}
            />
            <span>{listing.location || "Location undisclosed"}</span>
          </p>
          {!sold && (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-soft">
              {listing.description}
            </p>
          )}

          {sold ? (
            <div className="mt-auto pt-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <PublicSalePrice listing={listing} />
                {listing.soldAt && (
                  <p className="mt-1 text-xs text-ink-soft">
                    Completed{" "}
                    <time dateTime={listing.soldAt}>
                      {formatSoldDate(listing.soldAt)}
                    </time>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-5">
              <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-paper">
                {financials.map(([label, amount]) => (
                  <div
                    key={label}
                    className={`min-w-0 px-3 py-2.5 ${label === "Asking price" ? "col-span-2 border-b border-line bg-emerald-50/70" : financials.length === 2 ? "col-span-2" : "even:border-r even:border-line"}`}
                  >
                    <dt className="text-xs leading-4 text-ink-soft">{label}</dt>
                    <dd
                      className={`mt-1 break-words font-semibold leading-5 text-navy-950 tabular-nums ${label === "Asking price" ? "text-base" : "text-sm"}`}
                    >
                      {formatListingMoney(amount, listing.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
