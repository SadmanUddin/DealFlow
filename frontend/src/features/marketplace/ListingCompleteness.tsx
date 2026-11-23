import { getListingCompleteness } from "./listing-completeness";

export function ListingCompleteness({
  listing,
}: {
  listing: Parameters<typeof getListingCompleteness>[0];
}) {
  const { percentage, missingRequired, missingRecommended } =
    getListingCompleteness(listing);
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3 text-xs leading-5 text-ink-soft">
      <p className="font-semibold text-navy-950">
        {percentage}% listing completeness
      </p>
      <progress
        aria-label="Listing completeness"
        className="block h-2 w-full max-w-48 accent-emerald-800"
        max={100}
        value={percentage}
      />
      {missingRequired.length > 0 && (
        <p>Missing required information: {missingRequired.join(", ")}.</p>
      )}
      {missingRecommended.length > 0 && (
        <p>Add recommended information: {missingRecommended.join(", ")}.</p>
      )}
      <p>
        Completeness measures how much listing information is filled in. Use it
        as a guide when adding business details.
      </p>
    </div>
  );
}
