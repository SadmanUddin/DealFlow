import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import { BuyerOverviewPage } from "./BuyerOverviewPage";
import { BuyerSavedPage } from "./BuyerSavedPage";
import * as buyerApi from "./api";
import * as dealApi from "@/features/deals/api";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  listFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  listNotifications: vi.fn(),
}));
vi.mock("@/features/deals/api", async (original) => ({
  ...(await original<typeof import("@/features/deals/api")>()),
  listDeals: vi.fn(),
}));

const auth: AuthContextValue = {
  user: {
    id: 4,
    email: "buyer@example.test",
    name: "Buyer Example",
    role: "buyer",
    emailVerified: true,
  },
  isLoading: false,
  initializationError: null,
  isSigningIn: false,
  isSigningUp: false,
  isSigningOut: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};
const pagination = (total: number) => ({
  page: 1,
  limit: 100,
  total,
  totalPages: 1,
});
const favorite = {
  id: 14,
  listingId: 8,
  title: "Neighborhood bakery",
  description: "Established bakery with loyal customers.",
  industry: "Food & Beverage",
  location: "Ghent, Belgium",
  askingPrice: "485000.00",
  currency: "EUR",
  publishedAt: "2026-10-14T12:00:00.000Z",
  createdAt: "2026-10-15T12:00:00.000Z",
};

function renderPage(path: string, page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/buyer" element={page} />
            <Route path="/buyer/saved" element={page} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(buyerApi.listFavorites)
    .mockReset()
    .mockResolvedValue({ favorites: [favorite], pagination: pagination(1) });
  vi.mocked(buyerApi.listNotifications)
    .mockReset()
    .mockResolvedValue({ notifications: [], pagination: pagination(0) });
  vi.mocked(buyerApi.removeFavorite)
    .mockReset()
    .mockResolvedValue({ removed: true });
  vi.mocked(dealApi.listDeals)
    .mockReset()
    .mockResolvedValue({ deals: [], pagination: pagination(0) });
});

describe("buyer workspace", () => {
  it("shows accurate saved, deal, and unread notification counts", async () => {
    vi.mocked(buyerApi.listFavorites).mockResolvedValue({
      favorites: [favorite],
      pagination: pagination(7),
    });
    vi.mocked(dealApi.listDeals).mockResolvedValue({
      deals: [],
      pagination: pagination(2),
    });
    vi.mocked(buyerApi.listNotifications).mockImplementation(
      async (_page, _limit, unread) => ({
        notifications: [],
        pagination: pagination(unread ? 3 : 0),
      }),
    );
    renderPage("/buyer", <BuyerOverviewPage />);
    expect(
      await screen.findByRole("heading", { name: "Welcome back, Buyer" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("searches saved listings and removes one using the favorites endpoint", async () => {
    const user = userEvent.setup();
    renderPage("/buyer/saved", <BuyerSavedPage />);
    expect(await screen.findByText("Neighborhood bakery")).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /search saved businesses/i }),
      "not found",
    );
    expect(screen.getByText(/no saved businesses match/i)).toBeInTheDocument();
    await user.clear(
      screen.getByRole("textbox", { name: /search saved businesses/i }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /remove neighborhood bakery from saved businesses/i,
      }),
    );
    await waitFor(() =>
      expect(buyerApi.removeFavorite).toHaveBeenCalledWith(8),
    );
  });

  it("keeps API failures visible and retryable", async () => {
    vi.mocked(buyerApi.listFavorites).mockRejectedValueOnce(
      new Error("network"),
    );
    renderPage("/buyer/saved", <BuyerSavedPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(buyerApi.listFavorites).toHaveBeenCalledTimes(2),
    );
  });
});
