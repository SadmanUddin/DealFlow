export { formatSoldDate as diligenceDateLabel } from "@/features/marketplace/marketplace-format";

export const diligenceStatusLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
