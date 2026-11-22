import { ArrowLeft, ArrowUpRight, BadgeCheck, MapPin } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { PublicListing } from "./marketplace-api";
import {
  formatListingMoney,
  formatSaleMoney,
  formatSoldDate,
} from "./marketplace-format";
import { ListingMedia } from "./ListingMedia";

export function SoldBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-950 px-3 py-1.5 text-xs font-bold tracking-[0.14em] text-white shadow-sm">
      <BadgeCheck size={15} aria-hidden="true" /> SOLD
    </span>
  );
}

export function PublicSalePrice({ listing }: { listing: PublicListing }) {
  return listing.publicSalePrice != null && listing.publicSaleCurrency ? (
    <>
      <p className="text-xs font-semibold text-emerald-900">Final sale price</p>
      <p className="mt-1 break-words text-xl font-semibold tracking-tight text-navy-950 tabular-nums">
        {formatSaleMoney(listing.publicSalePrice, listing.publicSaleCurrency)}
      </p>
    </>
  ) : (
    <p className="text-sm font-semibold text-emerald-950">
      Sold — Price Undisclosed
    </p>
  );
}

export function SoldListingDetail({
  listing,
  imageUrl,
  onImageError,
}: {
  listing: PublicListing;
  imageUrl: string | null;
  onImageError: () => void;
}) {
  return (
    <div className="page-container py-8 sm:py-14">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"
        to="/marketplace?availability=sold"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Sold businesses
      </Link>
      <article className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          <div className="relative min-h-56 overflow-hidden bg-emerald-50 sm:min-h-80">
            <ListingMedia
              industry={listing.industry}
              title={listing.title}
              imageUrl={imageUrl}
              onImageError={onImageError}
              eager
            />
            <div className="absolute left-5 top-5">
              <SoldBadge />
            </div>
          </div>
          <div className="p-6 sm:p-10">
            <p className="text-sm font-semibold text-emerald-900">
              This Business Has Been Sold
            </p>
            <h1 className="mt-3 break-words font-display text-4xl leading-[1.02] tracking-[-0.025em] text-navy-950 sm:text-6xl">
              {listing.title}
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              {listing.industry && <span>{listing.industry}</span>}
              {listing.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={15} aria-hidden="true" /> {listing.location}
                </span>
              )}
            </p>
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
              <PublicSalePrice listing={listing} />
              {listing.soldAt && (
                <p className="mt-2 text-sm text-emerald-950">
                  Completed{" "}
                  <time dateTime={listing.soldAt}>
                    {formatSoldDate(listing.soldAt)}
                  </time>
                </p>
              )}
              {listing.askingPrice != null && (
                <p className="mt-2 text-sm text-ink-soft">
                  Original asking price ·{" "}
                  {formatListingMoney(listing.askingPrice, listing.currency)}
                </p>
              )}
            </div>
            <p className="mt-6 text-sm text-ink-soft">
              This business is no longer available.
            </p>
            <Button
              asChild
              variant="accent"
              className="mt-3 h-auto min-h-10 whitespace-normal bg-emerald-900 text-left text-white hover:bg-emerald-950"
            >
              <Link to="/marketplace">
                Explore Available Businesses{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <section
          className="border-t border-line p-6 sm:p-10"
          aria-labelledby="sold-about"
        >
          <h2 id="sold-about" className="font-display text-3xl text-navy-950">
            About the business
          </h2>
          <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-ink-soft">
            {listing.description}
          </p>
        </section>
      </article>
    </div>
  );
}
