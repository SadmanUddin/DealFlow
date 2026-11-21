import { AxiosError } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiBaseUrl: "http://localhost:3000/api",
  apiClient: { get },
}));

describe("deal document downloads", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses the same authenticated deal-scoped blob endpoint and document ID", async () => {
    const blob = new Blob(["private document"]);
    get.mockResolvedValue({ data: blob });
    const { downloadDealDocument } = await import("./api");

    await expect(downloadDealDocument(40, 90)).resolves.toBe(blob);
    expect(get).toHaveBeenCalledWith("/deals/40/documents/90/download", {
      responseType: "blob",
    });
  });

  it("parses JSON API errors returned as a blob instead of showing an opaque Axios status", async () => {
    const error = new AxiosError("Request failed with status code 404");
    error.response = {
      data: new Blob([
        JSON.stringify({
          error: {
            code: "DOCUMENT_NOT_FOUND",
            message: "Deal document was not found",
          },
        }),
      ]),
      status: 404,
      statusText: "Not Found",
      headers: {},
      config: {} as never,
    };
    get.mockRejectedValue(error);
    const { downloadDealDocument } = await import("./api");

    await expect(downloadDealDocument(40, 90)).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "DOCUMENT_NOT_FOUND",
      message: "Deal document was not found",
    });
  });
});
