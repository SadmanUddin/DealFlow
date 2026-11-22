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

// Transaction prices retain cents and the full precision of PostgreSQL numeric.
export function formatSaleMoney(amount: string | number, currency: string) {
  const [whole, fractional = ""] = String(amount).split(".");
  if (!/^\d+$/.test(whole)) return formatListingMoney(amount, currency);
  const cents = Number(fractional.padEnd(2, "0"));
  const digits = cents ? 2 : 0;
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const localizedCents = new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: 2,
  }).format(cents);
  return formatter
    .formatToParts(BigInt(whole))
    .map(({ type, value }) => (type === "fraction" ? localizedCents : value))
    .join("");
}

export function formatSoldDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
