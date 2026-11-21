import { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { toApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client";
import { getPublishedListing, getPublicListings } from "./marketplace-api";

const listing = {
  id: 4,
  title: "A public company",
  description: "A public listing description with enough context.",
  industry: "Services",
  location: "Antwerp",
  askingPrice: "250000.00",
  annualRevenue: "410000.00",
  ebitda: null,
  currency: "EUR",
  publishedAt: "2026-10-01T10:00:00.000Z",
  createdAt: "2026-09-27T10:00:00.000Z",
  status: "published",
  sellerId: 999,
  sellerEmail: "private@example.test",
};

const page = {
  listings: [listing],
  pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
};

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe("marketplace API boundary", () => {
  it("calls the existing listing endpoint with supported filters and strips private fields", async () => {
    let requestUrl: string | undefined;
    let requestParams: unknown;
    apiClient.defaults.adapter = (async (config) => {
      requestUrl = config.url;
      requestParams = config.params;
      return {
        config,
        data: page,
        headers: {},
        status: 200,
        statusText: "OK",
      };
    }) as AxiosAdapter;

    const result = await getPublicListings({
      page: 2,
      limit: 12,
      industry: "Services",
      location: "Antwerp",
      sort: "price_asc",
    });

    expect(requestUrl).toBe("/listings");
    expect(requestParams).toMatchObject({
      page: 2,
      limit: 12,
      industry: "Services",
      location: "Antwerp",
      sort: "price_asc",
    });
    expect(requestParams).not.toHaveProperty("minPrice");
    expect(result.pagination).toEqual(page.pagination);
    expect(result.listings[0]).not.toHaveProperty("sellerId");
    expect(result.listings[0]).not.toHaveProperty("sellerEmail");
    expect(result.listings[0]).not.toHaveProperty("status");
  });

  it("fetches a published detail by ID and keeps only the public response fields", async () => {
    apiClient.defaults.adapter = (async (config) => ({
      config,
      data: { listing },
      headers: {},
      status: 200,
      statusText: "OK",
    })) as AxiosAdapter;

    const result = await getPublishedListing(4);
    expect(result.id).toBe(4);
    expect(result).not.toHaveProperty("sellerId");
    expect(result).not.toHaveProperty("sellerEmail");
  });

  it("rejects malformed API data with a clear boundary error", async () => {
    apiClient.defaults.adapter = (async (config) => ({
      config,
      data: { listings: [{ id: "not-an-id" }], pagination: {} },
      headers: {},
      status: 200,
      statusText: "OK",
    })) as AxiosAdapter;

    await expect(
      getPublicListings({ page: 1, limit: 12, sort: "newest" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("normalizes mocked backend errors without leaking request details", () => {
    const error = new AxiosError(
      "Request failed",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 503,
        statusText: "Unavailable",
        headers: {},
        config: { headers: {} } as never,
        data: {
          error: { code: "SERVICE_UNAVAILABLE", message: "Try again shortly" },
        },
      },
    );
    expect(toApiError(error)).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Try again shortly",
    });
  });
});
