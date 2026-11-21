import axios from "axios";
import { describe, expect, it } from "vitest";
import { toApiError } from "./api-error";

describe("API error normalization", () => {
  it("normalizes 429 responses and numeric Retry-After headers", () => {
    const error = new axios.AxiosError("Too many requests");
    error.response = {
      data: { error: { code: "RATE_LIMITED", message: "Try later" } },
      status: 429,
      statusText: "Too Many Requests",
      headers: { "Retry-After": "17" },
      config: {} as never,
    };
    const normalized = toApiError(error);
    expect(normalized.status).toBe(429);
    expect(normalized.code).toBe("RATE_LIMITED");
    expect(normalized.message).toBe("Try later");
    expect(normalized.retryAfterSeconds).toBe(17);
  });
});
