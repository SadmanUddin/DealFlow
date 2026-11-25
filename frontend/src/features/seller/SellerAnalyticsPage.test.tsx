import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerAnalyticsPage } from "./SellerAnalyticsPage";
import { fetchSellerAnalytics, type SellerAnalytics } from "./analytics-api";
import { listMyListings } from "./api";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: 22 } }),
}));
vi.mock("./analytics-api", async (original) => ({
  ...(await original<typeof import("./analytics-api")>()),
  fetchSellerAnalytics: vi.fn(),
}));
vi.mock("./api", () => ({ listMyListings: vi.fn() }));

const business = {
  id: 1,
  title: "Independent bakery",
  status: "published",
  publishedAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  metrics: { views: null, inquiries: 0, offers: 0, accepted: 0, completed: 0 },
};
const listingNames = [
  business.title,
  "Local bicycle shop",
  "Software studio",
  "Print workshop",
];
const summary: SellerAnalytics = {
  window: {
    from: "2026-10-01",
    today: "2026-10-30",
    coverage: null,
    asOf: "2026-10-30T12:00:00Z",
    interval: "day",
  },
  totals: business.metrics,
  trends: [],
  listingCount: 4,
  pendingOffers: 0,
  offerAcceptanceRate: null,
  listings: [],
  listingViews: null,
  insights: [],
  statusCounts: {},
  inquiriesByListing: [],
};

function renderAnalytics(path = "/seller/analytics") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/seller/analytics" element={<SellerAnalyticsPage />} />
          <Route
            path="/seller/analytics/listings/:id"
            element={<SellerAnalyticsPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchSellerAnalytics).mockImplementation(async (_range, ids) => ({
    ...summary,
    listings: (ids ?? []).map((id) => ({
      ...business,
      id,
      title: listingNames[id - 1],
    })),
    listingViews: ids?.length === 1 ? { total: 15, recent: 5 } : null,
  }));
  vi.mocked(listMyListings).mockResolvedValue({
    listings: listingNames.map((title, index) => ({
      id: index + 1,
      title,
      description: "Isolated listing fixture",
      industry: null,
      location: null,
      askingPrice: null,
      annualRevenue: null,
      ebitda: null,
      currency: "USD",
      status: "published",
      publishedAt: business.publishedAt,
      createdAt: business.publishedAt,
      updatedAt: business.publishedAt,
      rejectionReason: null,
    })),
    pagination: { page: 1, limit: 10, total: 4, totalPages: 1 },
  });
});

describe("seller performance analytics", () => {
  it("renders metrics and missing history, and switches date range", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    const metrics = await screen.findByRole("region", {
      name: "Performance summary",
    });
    expect(
      within(metrics).getByText("Buyer-offer acceptance rate"),
    ).toBeInTheDocument();
    expect(within(metrics).getAllByText("N/A")).toHaveLength(2);
    expect(
      screen.getByText(
        /View analytics are available from the date tracking is enabled/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "View history unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No buyer engagement" }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Date range"), "90");
    expect(fetchSellerAnalytics).toHaveBeenLastCalledWith("90", []);
  });

  it("opens owned listing analytics with status, publication date, and recent views", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await user.click(
      await screen.findByRole("link", {
        name: /view analytics for Independent bakery/i,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: business.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText(/Publication date/)).toBeInTheDocument();
    expect(
      screen.getByText("Views in the last 7 UTC days"),
    ).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "All seller analytics" }),
    ).toBeInTheDocument();
  });

  it("selects comparison listings with the keyboard and caps selection at three", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    const first = await screen.findByRole("checkbox", {
      name: /Independent bakery/,
    });
    first.focus();
    await user.keyboard(" ");
    expect(first).toBeChecked();
    await user.click(
      screen.getByRole("checkbox", { name: /Local bicycle shop/ }),
    );
    const comparison = await screen.findByRole("region", {
      name: "Listing comparison results",
    });
    expect(
      within(comparison).getByRole("heading", { name: /Independent bakery/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Software studio/ }));
    expect(
      screen.getByRole("checkbox", { name: /Print workshop/ }),
    ).toBeDisabled();
    expect(fetchSellerAnalytics).toHaveBeenLastCalledWith("30", [1, 2, 3]);
    await user.click(
      screen.getByRole("button", { name: /Remove Independent bakery/ }),
    );
    expect(
      screen.getByRole("checkbox", { name: /Print workshop/ }),
    ).toBeEnabled();
  });

  it("offers retry after an analytics API error", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSellerAnalytics).mockRejectedValueOnce(
      new Error("Service unavailable"),
    );
    renderAnalytics();
    expect(
      screen.getByRole("status", { name: "Loading workspace data" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Analytics unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("region", { name: "Performance summary" }),
    ).toBeInTheDocument();
  });
});
