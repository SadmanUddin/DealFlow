import { apiBaseUrl } from "@/lib/api-client";

export function listingImageSrc(imageUrl: string) {
  const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin;
  return new URL(imageUrl, apiOrigin).toString();
}
