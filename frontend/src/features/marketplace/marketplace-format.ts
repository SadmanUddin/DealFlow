export function formatListingMoney(
  amount: string | number | null,
  currency: string,
) {
  if (amount === null || amount === "") return "Not disclosed";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "Not disclosed";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}
