import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import type { PublicListing } from "./marketplace-api";
import { PublicSalePrice, SoldBadge } from "./SoldListingPresentation";
import { formatListingMoney, formatSoldDate } from "./marketplace-format";
import { listingImageSrc } from "./listing-image-url";

export function ListingCard({ listing }: { listing: PublicListing }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl =
    listing.imageUrl && failedImageUrl !== listing.imageUrl
      ? listing.imageUrl
      : null;
  const sold = listing.status === "sold";
  return (
    <Card className="group h-full overflow-hidden border-line/90 shadow-none transition duration-200 hover:-translate-y-0.5 hover:border-emerald-800/25 hover:shadow-card">
      <Link
        aria-label={`View ${listing.title}`}
        className="flex h-full flex-col rounded-[inherit] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-emerald-700/35"
        to={`/listings/${listing.id}`}
      >
        <div className="relative flex aspect-[1.9/1] items-end overflow-hidden border-b border-line bg-[linear-gradient(125deg,#eff5f1_0%,#e5efe8_58%,#d6e6db_100%)] p-5 sm:p-6">
          {imageUrl ? (
            <img
              alt={`Seller-provided image for ${listing.title}`}
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
              src={listingImageSrc(imageUrl)}
              onError={() => setFailedImageUrl(listing.imageUrl ?? null)}
            />
          ) : null}
          {!imageUrl ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_8%,rgba(255,255,255,0.9),transparent_34%),linear-gradient(35deg,transparent_45%,rgba(255,255,255,0.36)_45%,rgba(255,255,255,0.36)_46%,transparent_46%)]"
            />
          ) : null}
          {!imageUrl ? (
            <div
              aria-hidden="true"
              className="absolute -right-8 -top-24 size-64 rounded-full border border-emerald-950/[0.08] sm:size-72"
            />
          ) : null}
          {!imageUrl ? (
            <div
              aria-hidden="true"
              className="absolute -right-1 -top-16 size-48 rounded-full border border-emerald-950/[0.08]"
            />
          ) : null}
          {!imageUrl ? (
            <span className="relative grid size-12 place-items-center rounded-full border border-white/90 bg-white/80 text-emerald-900 shadow-sm backdrop-blur">
              <Building2 aria-hidden="true" size={21} strokeWidth={1.7} />
            </span>
          ) : null}
          {sold ? (
            <div className="absolute left-4 top-4">
              <SoldBadge />
            </div>
          ) : (
            <span className="absolute bottom-5 right-5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-navy-950/45 sm:bottom-6 sm:right-6">
              Business opportunity
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5 sm:p-6">
          {listing.industry ? (
            <p className="w-fit max-w-full truncate rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              {listing.industry}
            </p>
          ) : null}
          <div className="mt-3 flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-xl font-semibold leading-snug tracking-[-0.035em] text-navy-950 transition group-hover:text-emerald-900">
              {listing.title}
            </h3>
            <ArrowUpRight
              aria-hidden="true"
              className="mt-1 shrink-0 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-800"
              size={18}
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin
              aria-hidden="true"
              className="shrink-0 text-emerald-800"
              size={15}
            />
            <span className="truncate">
              {listing.location || "Location not disclosed"}
            </span>
          </p>
          {!sold && listing.sellerName ? (
            <p className="mt-2 text-xs text-ink-faint">
              Published by{" "}
              <span className="font-semibold text-ink-soft">
                {listing.sellerName}
              </span>
            </p>
          ) : null}
          {!sold && (
            <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-ink-soft">
              {listing.description}
            </p>
          )}

          {sold ? (
            <div className="mt-auto pt-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <PublicSalePrice listing={listing} />
                {listing.soldAt && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Completed{" "}
                    <time dateTime={listing.soldAt}>
                      {formatSoldDate(listing.soldAt)}
                    </time>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-5">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                  Asking price
                </p>
                <p className="mt-1.5 truncate text-lg font-semibold tracking-tight text-navy-950">
                  {formatListingMoney(listing.askingPrice, listing.currency)}
                </p>
              </div>
              {listing.annualRevenue !== null ? (
                <div className="min-w-0 border-l border-line pl-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                    Annual revenue
                  </p>
                  <p className="mt-1.5 truncate text-base font-semibold tracking-tight text-navy-950">
                    {formatListingMoney(
                      listing.annualRevenue,
                      listing.currency,
                    )}
                  </p>
                </div>
              ) : (
                <div className="min-w-0 border-l border-line pl-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                    Annual revenue
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-ink-faint">
                    Not disclosed
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
