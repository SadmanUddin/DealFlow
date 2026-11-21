import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryDefaults, retryQuery, retryQueryDelay } from "./query-defaults";
import { ApiError } from "@/lib/api-error";

describe("shared query defaults", () => {
  it("avoids automatic retries for rate limits and client errors", () => {
    expect(retryQuery(0, new ApiError("Slow down", { status: 429 }))).toBe(
      false,
    );
    expect(retryQuery(0, new ApiError("Forbidden", { status: 403 }))).toBe(
      false,
    );
  });

  it("retries a transient network or server failure once", () => {
    expect(retryQuery(0, new Error("network unavailable"))).toBe(true);
    expect(retryQuery(1, new Error("network unavailable"))).toBe(false);
    expect(retryQuery(0, new ApiError("Unavailable", { status: 503 }))).toBe(
      true,
    );
  });

  it("respects Retry-After and caps long waits", () => {
    expect(
      retryQueryDelay(
        0,
        new ApiError("Slow down", { status: 429, retryAfterSeconds: 12 }),
      ),
    ).toBe(12_000);
    expect(
      retryQueryDelay(
        0,
        new ApiError("Slow down", {
          status: 429,
          retryAfterSeconds: 60 * 60,
        }),
      ),
    ).toBe(15 * 60_000);
  });

  it("uses shared freshness defaults and deduplicates identical concurrent requests", async () => {
    expect(queryDefaults.staleTime).toBe(45_000);
    expect(queryDefaults.gcTime).toBe(5 * 60_000);
    expect(queryDefaults.refetchOnWindowFocus).toBe(false);
    expect(queryDefaults.retryOnMount).toBe(false);

    const client = new QueryClient({
      defaultOptions: { queries: { ...queryDefaults, retry: false } },
    });
    const queryFn = vi.fn(async () => "shared");
    const results = await Promise.all([
      client.fetchQuery({ queryKey: ["private", "same"], queryFn }),
      client.fetchQuery({ queryKey: ["private", "same"], queryFn }),
    ]);
    expect(results).toEqual(["shared", "shared"]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
