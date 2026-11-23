type ListingProfile = {
  title?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  askingPrice?: string | number | null;
  annualRevenue?: string | number | null;
  ebitda?: string | number | null;
  imageUrl?: string | null;
  hasImage?: boolean;
};

const hasText = (value: string | null | undefined) => Boolean(value?.trim());
const hasAmount = (value: string | number | null | undefined) =>
  value != null && hasText(String(value));

export function getListingCompleteness(listing: ListingProfile) {
  const required = [
    ["business name", hasText(listing.title)],
    ["description", hasText(listing.description)],
  ] as const;
  const recommended = [
    ["industry", hasText(listing.industry)],
    ["location", hasText(listing.location)],
    ["asking price", hasAmount(listing.askingPrice)],
    ["annual revenue", hasAmount(listing.annualRevenue)],
    ["EBITDA", hasAmount(listing.ebitda)],
    ["business image", listing.hasImage ?? hasText(listing.imageUrl)],
  ] as const;
  const missing = (fields: ReadonlyArray<readonly [string, boolean]>) =>
    fields.filter(([, present]) => !present).map(([label]) => label);
  const missingRequired = missing(required);
  const missingRecommended = missing(recommended);
  const total = required.length + recommended.length;
  return {
    percentage: Math.round(
      ((total - missingRequired.length - missingRecommended.length) / total) *
        100,
    ),
    missingRequired,
    missingRecommended,
  };
}
