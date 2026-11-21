import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearPrivateQueryCache } from "./query-cache";

describe("private query cache cleanup", () => {
  it("removes user-scoped data while preserving public marketplace and auth cache", async () => {
    const client = new QueryClient();
    client.setQueryData(["marketplace", { q: "coffee" }], ["public listing"]);
    client.setQueryData(["public", "taxonomy"], ["category"]);
    client.setQueryData(["auth", "session"], { id: 3 });
    client.setQueryData(["auth", "profile"], { email: "private@example.test" });
    client.setQueryData(["buyer", "favorites"], ["private favorite"]);
    client.setQueryData(["deals", "mine"], ["private deal"]);

    await clearPrivateQueryCache(client);

    expect(client.getQueryData(["marketplace", { q: "coffee" }])).toEqual([
      "public listing",
    ]);
    expect(client.getQueryData(["public", "taxonomy"])).toEqual(["category"]);
    expect(client.getQueryData(["auth", "session"])).toEqual({ id: 3 });
    expect(client.getQueryData(["auth", "profile"])).toBeUndefined();
    expect(client.getQueryData(["buyer", "favorites"])).toBeUndefined();
    expect(client.getQueryData(["deals", "mine"])).toBeUndefined();
    client.clear();
  });
});
