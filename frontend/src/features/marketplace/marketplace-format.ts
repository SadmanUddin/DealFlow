export const financialDisclosure =
  "Financial figures are provided by the seller and have not been independently verified by DealFlow.";

export function formatListingMoney(
  amount: string | number | null | undefined,
  currency: string,
) {
  if (amount == null || amount === "") return "Not disclosed";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "Not disclosed";
  // PostgreSQL returns exact decimal strings. Format the integer separately to
  // keep amounts beyond Number.MAX_SAFE_INTEGER and preserve disclosed cents.
  const decimal = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount));
  const cents = decimal ? Number((decimal[3] ?? "").padEnd(2, "0")) : 0;
  const digits = cents || (!decimal && !Number.isInteger(value)) ? 2 : 0;
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    if (!decimal) return formatter.format(value);
    const [, sign, whole] = decimal;
    const integer = sign && Number(whole) === 0 ? -0 : BigInt(sign + whole);
    const localizedCents = new Intl.NumberFormat(undefined, {
      minimumIntegerDigits: 2,
    }).format(cents);
    return formatter
      .formatToParts(integer)
      .map(({ type, value }) => (type === "fraction" ? localizedCents : value))
      .join("");
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function formatSaleMoney(amount: string | number, currency: string) {
  return formatListingMoney(amount, currency);
}

export function formatSoldDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
