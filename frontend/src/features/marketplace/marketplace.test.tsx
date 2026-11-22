import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api-error";
import { ListingDetailsPage } from "./ListingDetailsPage";
import { ListingCard } from "./ListingCard";
import { formatListingMoney } from "./marketplace-format";
import { MarketplacePage } from "./MarketplacePage";
import type { PublicListing } from "./marketplace-api";

const apiMocks = vi.hoisted(() => ({
  getPublicListings: vi.fn(),
  getPublishedListing: vi.fn(),
  savePublishedListing: vi.fn(),
  unsavePublishedListing: vi.fn(),
  submitListingReport: vi.fn(),
  startListingConversation: vi.fn(),
}));

vi.mock("./marketplace-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./marketplace-api")>();
  return { ...actual, ...apiMocks };
});
vi.mock("@/features/buyer/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/buyer/api")>();
  return {
    ...actual,
    startListingConversation: apiMocks.startListingConversation,
  };
});

const listing: PublicListing = {
  id: 8,
  sellerName: "Actual Seller",
  title: "Independent neighborhood bakery",
  description:
    "A well-established bakery with a loyal local customer base and room to grow.",
  industry: "Food & Beverage",
  location: "Ghent, Belgium",
  askingPrice: "485000.00",
  annualRevenue: "620000.00",
  ebitda: "96000.00",
  currency: "EUR",
  publishedAt: "2026-10-14T12:00:00.000Z",
  createdAt: "2026-10-10T12:00:00.000Z",
};

const listingPage = (
  listings: PublicListing[] = [listing],
  page = 1,
  totalPages = 1,
) => ({
  listings,
  pagination: {
    page,
    limit: 12,
    total: totalPages > 1 ? 24 : listings.length,
    totalPages,
  },
});

const guestAuth: AuthContextValue = {
  user: null,
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

const signedInAuth: AuthContextValue = {
  ...guestAuth,
  user: {
    id: 31,
    email: "buyer@example.com",
    role: "buyer",
    emailVerified: true,
  },
};

function LocationSearch() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location-search">{useLocation().search}</output>
      <button onClick={() => navigate(-1)} type="button">
        Browser back
      </button>
    </>
  );
}

function renderMarketplace(initialPath = "/marketplace", auth = guestAuth) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationSearch />
          <Routes>
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/listings/:id" element={<ListingDetailsPage />} />
            <Route path="/buyer/conversations" element={<p>Buyer inbox</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMocks.getPublicListings.mockReset();
  apiMocks.getPublishedListing.mockReset();
  apiMocks.savePublishedListing.mockReset();
  apiMocks.unsavePublishedListing.mockReset();
  apiMocks.submitListingReport.mockReset();
  apiMocks.startListingConversation.mockReset();
  apiMocks.getPublicListings.mockResolvedValue(listingPage());
  apiMocks.getPublishedListing.mockResolvedValue(listing);
});

describe("public marketplace", () => {
  it("loads a versioned public image for a listing card", async () => {
    const imageListing = {
      ...listing,
      imageUrl: "/api/listings/8/image?v=1795281600000",
    };
    apiMocks.getPublicListings.mockResolvedValue(listingPage([imageListing]));
    const { container } = renderMarketplace();

    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "http://localhost:3000/api/listings/8/image?v=1795281600000",
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      "Seller-provided image for Independent neighborhood bakery",
    );
  });

  it("loads the public listing image on the detail page", async () => {
    apiMocks.getPublishedListing.mockResolvedValue({
      ...listing,
      imageUrl: "/api/listings/8/image?v=1795281600000",
    });
    const { container } = renderMarketplace("/listings/8");

    await screen.findByRole("heading", {
      name: "Independent neighborhood bakery",
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "http://localhost:3000/api/listings/8/image?v=1795281600000",
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      "Seller-provided image for Independent neighborhood bakery",
    );
  });

  it("renders public listing cards with industry, location, and supported financials", async () => {
    renderMarketplace();
    const card = await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    expect(within(card).getByText("Food & Beverage")).toBeInTheDocument();
    expect(within(card).getByText("Ghent, Belgium")).toBeInTheDocument();
    expect(within(card).getByText(/€485,000/)).toBeInTheDocument();
    expect(within(card).getByText(/€620,000/)).toBeInTheDocument();
    expect(screen.getByText("1 business")).toBeInTheDocument();
  });

  it("toggles a browse industry in the URL without removing keyboard focus", async () => {
    const user = userEvent.setup();
    renderMarketplace();
    const chip = screen.getByRole("button", { name: "Food" });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveFocus();
    await waitFor(() => {
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({ industry: "Food", page: 1 }),
      );
    });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();
  });

  it("shows an illustrated placeholder explicitly labelled when a seller photo is missing", async () => {
    apiMocks.getPublicListings.mockResolvedValue(
      listingPage([{ ...listing, imageUrl: null }]),
    );
    renderMarketplace();
    const card = await screen.findByRole("link", { name: /view independent/i });
    expect(within(card).getByText("No photo provided")).toBeVisible();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
  });

  it("reads supported query parameters and submits search into the URL", async () => {
    const user = userEvent.setup();
    renderMarketplace(
      "/marketplace?page=2&limit=12&sort=price_desc&industry=Retail&minPrice=100",
    );
    await waitFor(() => {
      expect(apiMocks.getPublicListings).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 12,
          sort: "price_desc",
          industry: "Retail",
        }),
      );
    });
    await user.type(
      screen.getByRole("searchbox", { name: "Search businesses" }),
      "bakery",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "bakery", page: 1, industry: "Retail" }),
      );
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "q=bakery",
      );
    });
  });

  it("applies business, industry, and location criteria together", async () => {
    const user = userEvent.setup();
    renderMarketplace();
    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    await user.type(screen.getByLabelText("Industry / category"), "Retail");
    await user.type(screen.getByLabelText("Location"), "Brussels");
    await user.type(
      screen.getByRole("searchbox", { name: "Search businesses" }),
      "bakery",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          industry: "Retail",
          location: "Brussels",
          q: "bakery",
          page: 1,
        }),
      );
    });
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "industry=Retail",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "location=Brussels",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("q=bakery");
    await user.click(screen.getByRole("button", { name: "Browser back" }));
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).toBeEmptyDOMElement(),
    );
  });

  it("exposes supported financial range controls", async () => {
    renderMarketplace();
    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Financial filters" }));
    expect(screen.getByLabelText(/minimum asking price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum asking price/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/minimum annual revenue/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/maximum annual revenue/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum ebitda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum ebitda/i)).toBeInTheDocument();
  });

  it("applies numerical ranges to supported API filters and URL parameters", async () => {
    const user = userEvent.setup();
    renderMarketplace();
    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    await user.click(screen.getByRole("button", { name: "Financial filters" }));
    await user.type(screen.getByLabelText(/minimum asking price/i), "100000");
    await user.type(screen.getByLabelText(/maximum asking price/i), "900000");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({ minPrice: "100000", maxPrice: "900000" }),
      ),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "minPrice=100000",
    );
  });

  it("uses backend sorting and pagination while preserving filters in the URL", async () => {
    const user = userEvent.setup();
    apiMocks.getPublicListings.mockImplementation(async (filters) =>
      listingPage([listing], filters.page, 2),
    );
    renderMarketplace("/marketplace?industry=Retail");
    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    await user.selectOptions(screen.getByLabelText("Sort"), "price_asc");
    await waitFor(() =>
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          industry: "Retail",
          sort: "price_asc",
          page: 1,
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          industry: "Retail",
          sort: "price_asc",
          page: 2,
        }),
      ),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("page=2");
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "industry=Retail",
    );
  });

  it("shows an empty state and clears active filters", async () => {
    const user = userEvent.setup();
    apiMocks.getPublicListings.mockResolvedValue(listingPage([], 1, 0));
    renderMarketplace("/marketplace?q=not-found&sort=oldest");
    expect(
      await screen.findByText("No businesses match your search"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).toBeEmptyDOMElement(),
    );
    expect(
      screen.getByText("New opportunities are on the way"),
    ).toBeInTheDocument();
  });

  it("shows a retryable API error", async () => {
    const user = userEvent.setup();
    apiMocks.getPublicListings.mockRejectedValue(
      new Error("mock network failure"),
    );
    renderMarketplace();
    expect(
      await screen.findByRole(
        "heading",
        { name: "Marketplace unavailable" },
        { timeout: 2500 },
      ),
    ).toBeInTheDocument();
    apiMocks.getPublicListings.mockResolvedValueOnce(listingPage());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", {
        name: /view independent neighborhood bakery/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while the list request is pending", async () => {
    let resolveRequest:
      ((value: ReturnType<typeof listingPage>) => void) | undefined;
    apiMocks.getPublicListings.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderMarketplace();
    expect(
      screen.getByRole("status", { name: "Loading business listings" }),
    ).toBeInTheDocument();
    resolveRequest?.(listingPage());
    expect(
      await screen.findByRole("link", {
        name: /view independent neighborhood bakery/i,
      }),
    ).toBeInTheDocument();
  });
});

describe("listing details", () => {
  it("renders all supported public details and a sign-in call to action", async () => {
    renderMarketplace("/listings/8");
    expect(
      await screen.findByRole("heading", { name: listing.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
    expect(screen.getByText(/€96,000/)).toBeInTheDocument();
    expect(screen.getByText(/Published October 14, 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign in to dealflow/i }),
    ).toHaveAttribute("href", "/login");
    expect(apiMocks.getPublishedListing).toHaveBeenCalledWith(8);
  });

  it("shows the publisher and authenticated buyer actions", async () => {
    renderMarketplace("/listings/8", signedInAuth);
    expect(
      await screen.findByText(/signed in as a buyer/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start acquisition/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Published by Actual Seller")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save business" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /saved businesses/i }),
    ).toHaveAttribute("href", "/buyer/saved");
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
  });

  it("submits a listing report through the existing reports API", async () => {
    const user = userEvent.setup();
    apiMocks.submitListingReport.mockResolvedValue({
      created: true,
      report: { id: 12 },
    });
    renderMarketplace("/listings/8", signedInAuth);
    await screen.findByRole("button", { name: "Contact seller" });
    await user.click(
      screen.getByRole("button", { name: "Report this listing" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Reason"),
      "misleading_information",
    );
    await user.type(
      screen.getByLabelText(/tell us what is wrong/i),
      "The stated business details are inaccurate.",
    );
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() =>
      expect(apiMocks.submitListingReport).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: 8,
          category: "misleading_information",
        }),
      ),
    );
    expect(
      await screen.findByText(/sent to the DealFlow review team/),
    ).toBeInTheDocument();
  });

  it("opens or retrieves the existing ordinary listing conversation", async () => {
    const user = userEvent.setup();
    apiMocks.startListingConversation.mockResolvedValue({
      conversation: { id: 42 },
    });
    renderMarketplace("/listings/8", signedInAuth);
    await user.click(
      await screen.findByRole("button", { name: "Contact seller" }),
    );
    await waitFor(() =>
      expect(apiMocks.startListingConversation).toHaveBeenCalledWith(8),
    );
    expect(await screen.findByText("Buyer inbox")).toBeInTheDocument();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "conversation=42",
    );
  });

  it("saves and removes a published business through the favorites API", async () => {
    const user = userEvent.setup();
    apiMocks.savePublishedListing.mockResolvedValueOnce({ created: true });
    renderMarketplace("/listings/8", signedInAuth);
    const saveButton = await screen.findByRole("button", {
      name: "Save business",
    });
    apiMocks.getPublishedListing.mockResolvedValue({
      ...listing,
      isFavorite: true,
    });
    await user.click(saveButton);
    await waitFor(() =>
      expect(apiMocks.savePublishedListing).toHaveBeenCalledWith(8),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Remove from saved businesses",
      }),
    );
    await waitFor(() =>
      expect(apiMocks.unsavePublishedListing).toHaveBeenCalledWith(8),
    );
  });

  it("handles optional financial details that are not disclosed", async () => {
    apiMocks.getPublishedListing.mockResolvedValueOnce({
      ...listing,
      askingPrice: null,
      annualRevenue: null,
      ebitda: null,
    });
    renderMarketplace("/listings/8");
    expect(
      await screen.findByRole("heading", { name: listing.title }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not disclosed")).toHaveLength(3);
  });

  it("handles unpublished and missing listings as not found", async () => {
    apiMocks.getPublishedListing.mockRejectedValue(
      new ApiError("Business listing was not found", {
        status: 404,
        code: "LISTING_NOT_FOUND",
      }),
    );
    renderMarketplace("/listings/912");
    expect(
      await screen.findByRole(
        "heading",
        { name: "This opportunity can’t be found" },
        { timeout: 2500 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to marketplace/i }),
    ).toHaveAttribute("href", "/marketplace");
  });

  it("shows a detail loading state and a retryable service error", async () => {
    const user = userEvent.setup();
    apiMocks.getPublishedListing.mockRejectedValue(
      new Error("mock service failure"),
    );
    renderMarketplace("/listings/8");
    expect(
      screen.getByRole("status", { name: "Loading business listing" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole(
        "heading",
        { name: "Listing unavailable right now" },
        { timeout: 2500 },
      ),
    ).toBeInTheDocument();
    apiMocks.getPublishedListing.mockResolvedValueOnce(listing);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: listing.title }),
    ).toBeInTheDocument();
  });

  it("renders a card without seller-controlled private fields", () => {
    render(
      <MemoryRouter>
        <ListingCard listing={listing} />
      </MemoryRouter>,
    );
    expect(screen.getByText(listing.title)).toBeInTheDocument();
    expect(screen.queryByText("seller@example.test")).not.toBeInTheDocument();
  });

  it("renders missing optional financials and formats the listing currency", () => {
    const sparseListing = {
      ...listing,
      annualRevenue: null,
      askingPrice: "1250000.00",
      currency: "USD",
    };
    render(
      <MemoryRouter>
        <ListingCard listing={sparseListing} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/\$1,250,000/)).toBeInTheDocument();
    expect(screen.getByText("Not disclosed")).toBeInTheDocument();
    expect(formatListingMoney("500000", "GBP")).toMatch(/£500,000/);
  });
});

describe("sold businesses", () => {
  const sold: PublicListing = {
    ...listing,
    status: "sold",
    soldAt: "2026-11-20T12:00:00Z",
    publicSalePrice: null,
    publicSaleCurrency: null,
  };

  it("requests sold listings from the API and presents them as completed businesses", async () => {
    const user = userEvent.setup();
    apiMocks.getPublicListings.mockImplementation(async (filters) =>
      listingPage(filters.availability === "sold" ? [sold] : [listing]),
    );
    renderMarketplace();
    await screen.findByRole("link", { name: /view independent/i });
    const availability = screen.getByLabelText("Availability");
    expect(availability).toHaveValue("available");
    await user.selectOptions(availability, "sold");
    expect(await screen.findByText("Sold — Price Undisclosed")).toBeVisible();
    expect(screen.getByText("SOLD")).toBeVisible();
    expect(screen.queryByText("Business opportunity")).not.toBeInTheDocument();
    expect(apiMocks.getPublicListings).toHaveBeenLastCalledWith(
      expect.objectContaining({ availability: "sold", page: 1 }),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "availability=sold",
    );
  });

  it("shows the approved final price and replaces buyer actions on the sold detail", async () => {
    apiMocks.getPublishedListing.mockResolvedValue({
      ...sold,
      publicSalePrice: "450000.25",
      publicSaleCurrency: "EUR",
    });
    renderMarketplace("/listings/8", signedInAuth);
    expect(
      await screen.findByText("This Business Has Been Sold"),
    ).toBeVisible();
    expect(screen.getByText("Final sale price")).toBeVisible();
    expect(screen.getByText(/450,000\.25/)).toBeVisible();
    expect(screen.getByText(/original asking price/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Explore Available Businesses" }),
    ).toHaveAttribute("href", "/marketplace");
    expect(
      screen.queryByRole("button", { name: /inquiry|offer/i }),
    ).not.toBeInTheDocument();
  });
});
