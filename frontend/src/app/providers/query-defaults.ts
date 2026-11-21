import { toApiError } from "@/lib/api-error";

export function retryQuery(failureCount: number, error: unknown) {
  const { status } = toApiError(error);
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422 ||
    status === 429
  ) {
    return false;
  }
  if (
    status !== undefined &&
    status < 500 &&
    status !== 408 &&
    status !== 425
  ) {
    return false;
  }
  return failureCount < 1;
}

export function retryQueryDelay(attempt: number, error: unknown) {
  const apiError = toApiError(error);
  if (apiError.status === 429 && apiError.retryAfterSeconds !== undefined) {
    return Math.min(apiError.retryAfterSeconds * 1000, 15 * 60 * 1000);
  }
  return Math.min(500 * 2 ** attempt, 5_000);
}

export const queryDefaults = {
  staleTime: 45_000,
  gcTime: 5 * 60_000,
  retry: retryQuery,
  retryDelay: retryQueryDelay,
  retryOnMount: false,
  refetchOnWindowFocus: false,
};
