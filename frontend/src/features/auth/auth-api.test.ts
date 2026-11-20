import { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient, setCsrfToken } from "@/lib/api-client";
import { restoreSession, signOut, updateProfile } from "./api";

describe("CSRF-protected sign-out", () => {
  const originalAdapter = apiClient.defaults.adapter;

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    setCsrfToken(undefined);
  });

  it("fetches the cookie session CSRF token and sends it on sign-out", async () => {
    const observedHeaders: string[] = [];
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === "/auth/csrf") {
        return {
          config,
          data: { csrfToken: "fresh-csrf-token" },
          headers: {},
          status: 200,
          statusText: "OK",
        };
      }
      observedHeaders.push(String(config.headers.get("X-CSRF-Token")));
      return {
        config,
        data: { message: "Signed out" },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    }) as AxiosAdapter;

    await expect(signOut()).resolves.toEqual({ message: "Signed out" });
    expect(observedHeaders).toEqual(["fresh-csrf-token"]);
  });

  it("refreshes a rejected CSRF token once and retries the write once", async () => {
    let csrfReads = 0;
    let signOutWrites = 0;
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === "/auth/csrf") {
        csrfReads += 1;
        return {
          config,
          data: { csrfToken: `csrf-${csrfReads}` },
          headers: {},
          status: 200,
          statusText: "OK",
        };
      }
      signOutWrites += 1;
      if (signOutWrites === 1) {
        throw new AxiosError(
          "CSRF validation failed",
          "ERR_BAD_REQUEST",
          config,
          undefined,
          {
            config,
            data: {
              error: {
                code: "CSRF_VALIDATION_FAILED",
                message: "CSRF validation failed",
              },
            },
            headers: {},
            status: 403,
            statusText: "Forbidden",
          },
        );
      }
      return {
        config,
        data: { message: "Signed out" },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    }) as AxiosAdapter;

    await expect(signOut()).resolves.toEqual({ message: "Signed out" });
    expect(csrfReads).toBe(2);
    expect(signOutWrites).toBe(2);
  });

  it("treats an expired cookie session as unauthenticated during restoration", async () => {
    let csrfReads = 0;
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === "/auth/csrf") csrfReads += 1;
      throw new AxiosError(
        "Session expired",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        {
          config,
          data: {
            error: {
              code: "UNAUTHENTICATED",
              message: "Authentication is required",
            },
          },
          headers: {},
          status: 401,
          statusText: "Unauthorized",
        },
      );
    }) as AxiosAdapter;

    await expect(restoreSession()).resolves.toBeNull();
    expect(csrfReads).toBe(0);
  });

  it("shares one in-flight session restoration and CSRF lookup", async () => {
    let sessionReads = 0;
    let csrfReads = 0;
    apiClient.defaults.adapter = (async (config) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (config.url === "/auth/me") {
        sessionReads += 1;
        return {
          config,
          data: {
            user: {
              id: 42,
              email: "buyer@example.com",
              role: "buyer",
              emailVerified: false,
            },
          },
          headers: {},
          status: 200,
          statusText: "OK",
        };
      }
      csrfReads += 1;
      return {
        config,
        data: { csrfToken: "session-csrf-token" },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    }) as AxiosAdapter;

    const results = await Promise.all([
      restoreSession(),
      restoreSession(),
      restoreSession(),
    ]);

    expect(results.every((result) => result?.id === 42)).toBe(true);
    expect(sessionReads).toBe(1);
    expect(csrfReads).toBe(1);
  });

  it("shares a CSRF refresh across simultaneous protected writes", async () => {
    let csrfReads = 0;
    let writes = 0;
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === "/auth/csrf") {
        csrfReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          config,
          data: { csrfToken: "shared-csrf-token" },
          headers: {},
          status: 200,
          statusText: "OK",
        };
      }
      writes += 1;
      return {
        config,
        data: { user: { name: "Profile" } },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    }) as AxiosAdapter;

    await Promise.all([updateProfile("Alex One"), updateProfile("Alex Two")]);
    expect(csrfReads).toBe(1);
    expect(writes).toBe(2);
  });
});
