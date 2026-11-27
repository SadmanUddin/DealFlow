import { ArrowUpRight, Building2, MapPin, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { PublicListing } from "@/features/marketplace/marketplace-api";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { selectPromotedListings } from "./promoted-listings";
import { usePromotedListings } from "./usePromotedListings";

function PreviewListing({ listing }: { listing: PublicListing }) {
  return (
    <Link className="dealflow-listing" to={`/listings/${listing.id}`}>
      <div className="flex items-start gap-3">
        <span className="dealflow-listing-icon">
          <Building2 size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-emerald-800">
            {listing.industry || "Industry not provided"}
          </p>
          <h3 className="line-clamp-3 text-sm font-semibold leading-snug">
            {listing.title}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
            <MapPin size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate">
              {listing.location || "Location not provided"}
            </span>
          </p>
        </div>
        <ArrowUpRight
          size={16}
          className="shrink-0 text-emerald-800"
          aria-hidden="true"
        />
      </div>
      <dl className="dealflow-listing-financials">
        <div>
          <dt>Asking price</dt>
          <dd>{formatListingMoney(listing.askingPrice, listing.currency)}</dd>
        </div>
        {listing.annualRevenue != null && (
          <div>
            <dt>Annual revenue</dt>
            <dd>
              {formatListingMoney(listing.annualRevenue, listing.currency)}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}

export function MarketplacePreview() {
  const [keyword, setKeyword] = useState("");
  const navigate = useNavigate();
  const query = usePromotedListings();
  const listings = selectPromotedListings(
    query.data?.listings ?? [],
    false,
  ).slice(0, 2);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = keyword.trim();
    navigate(q ? `/marketplace?${new URLSearchParams({ q })}` : "/marketplace");
  }

  return (
    <section
      className="dealflow-preview"
      aria-labelledby="dealflow-preview-title"
    >
      <div className="dealflow-preview-bar">
        <div aria-hidden="true" className="dealflow-window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>DealFlow Marketplace</span>
        <Link
          to="/marketplace"
          aria-label="Open marketplace"
          className="dealflow-preview-open"
        >
          <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </div>
      <div className="dealflow-preview-content">
        <h2 id="dealflow-preview-title">Businesses for sale</h2>
        <form
          className="dealflow-preview-search"
          role="search"
          aria-label="Find a business"
          onSubmit={search}
        >
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Business keyword"
            placeholder="Search businesses"
            maxLength={120}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        {listings.length ? (
          <>
            <div className="dealflow-listings">
              {listings.map((listing) => (
                <PreviewListing key={listing.id} listing={listing} />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              Seller-provided financial figures
            </p>
          </>
        ) : (
          <div className="dealflow-preview-empty" role="status">
            <Building2 size={23} aria-hidden="true" />
            <p>
              {query.isPending
                ? "Loading businesses…"
                : query.isError
                  ? "Preview temporarily unavailable"
                  : "No businesses to preview right now"}
            </p>
            {!query.isPending && (
              <Link
                to="/marketplace"
                className="font-semibold text-emerald-800 underline underline-offset-4"
              >
                Browse the marketplace
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
