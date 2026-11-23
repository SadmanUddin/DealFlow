import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import type { PublicListing } from "@/features/marketplace/marketplace-api";
import { ListingDetailsPage } from "@/features/marketplace/ListingDetailsPage";
import { DealDetailPage } from "./DealDetailPage";

const mocks = vi.hoisted(() => ({
  createDeal: vi.fn(),
  getDeal: vi.fn(),
  listDealHistory: vi.fn(),
  listOffers: vi.fn(),
  respondToOffer: vi.fn(),
  withdrawOffer: vi.fn(),
  updateDealStatus: vi.fn(),
  createOffer: vi.fn(),
  listDealDocuments: vi.fn(),
  listDealConversations: vi.fn(),
  getDealConversation: vi.fn(),
  listDealConversationMessages: vi.fn(),
  sendDealConversationMessage: vi.fn(),
  startDealConversation: vi.fn(),
  getPublishedListing: vi.fn(),
}));

vi.mock("./diligence-api", async (original) => ({
  ...(await original<typeof import("./diligence-api")>()),
  getDiligence: async () => ({
    checklist: [],
    requests: [],
    checklistTotal: 0,
    requestTotal: 0,
    pageSize: 20,
    progress: {
      total: 0,
      completed: 0,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      overdue: 0,
      outstandingRequests: 0,
    },
    startedAt: null,
    firstDocumentAcceptedAt: null,
  }),
}));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...mocks,
}));
vi.mock("@/features/marketplace/marketplace-api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/marketplace/marketplace-api")
  >()),
  getPublishedListing: mocks.getPublishedListing,
}));

const buyerAuth: AuthContextValue = {
  user: {
    id: 11,
    email: "buyer@example.test",
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

const listing: PublicListing = {
  id: 8,
  title: "Regional specialty food distributor",
  description: "Established regional distribution business.",
  industry: "Food & Beverage",
  location: "Ghent, Belgium",
  askingPrice: "485000.00",
  annualRevenue: "620000.00",
  ebitda: null,
  currency: "EUR",
  publishedAt: "2026-10-14T12:00:00.000Z",
  createdAt: "2026-10-10T12:00:00.000Z",
};
const deal = {
  id: 40,
  listing_id: 8,
  buyer_id: 11,
  seller_id: 12,
  buyer_name: "Buyer Name",
  seller_name: "Seller Name",
  status: "proposed" as const,
  accepted_at: null,
  created_at: "2026-10-20T12:00:00.000Z",
  updated_at: "2026-10-20T12:00:00.000Z",
};
const offer = {
  id: 71,
  deal_id: 40,
  parent_offer_id: null,
  created_by: 12,
  created_by_name: "Seller Name",
  amount: "450000.00",
  currency: "EUR",
  message: "Seller proposal",
  status: "pending" as const,
  created_at: "2026-10-21T12:00:00.000Z",
  responded_at: null,
};
const page = { page: 1, limit: 100, total: 1, totalPages: 1 };

function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

function renderWithProviders(path: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 45_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={buyerAuth}>
        <MemoryRouter initialEntries={[path]}>
          <Location />
          <Routes>
            <Route path="/listings/:id" element={<ListingDetailsPage />} />
            <Route path="/buyer/deals/:id" element={<DealDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublishedListing.mockResolvedValue(listing);
  mocks.getDeal.mockResolvedValue(deal);
  mocks.listOffers.mockResolvedValue({ offers: [offer], pagination: page });
  mocks.listDealHistory.mockResolvedValue({
    activities: [],
    pagination: { ...page, total: 0 },
  });
  mocks.listDealDocuments.mockResolvedValue({
    documents: [],
    pagination: { ...page, total: 0 },
  });
  mocks.listDealConversations.mockResolvedValue({
    conversations: [],
    pagination: { ...page, total: 0 },
  });
  mocks.getDealConversation.mockResolvedValue(null);
});

describe("deal workflow", () => {
  it("starts a buyer deal from a public listing and opens the deal workspace", async () => {
    const user = userEvent.setup();
    mocks.createDeal.mockResolvedValue({ deal, created: true });
    renderWithProviders("/listings/8");

    await user.click(
      await screen.findByRole("button", { name: /start acquisition/i }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        "/buyer/deals/40",
      ),
    );
    expect(mocks.createDeal).toHaveBeenCalledWith(8);
  });

  it("shows actual negotiation history without exposing contact details and confirms acceptance", async () => {
    const user = userEvent.setup();
    mocks.respondToOffer.mockResolvedValue({ ...offer, status: "accepted" });
    renderWithProviders("/buyer/deals/40");

    expect(
      await screen.findByRole("heading", { name: listing.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Seller proposal")).toBeInTheDocument();
    const summary = screen.getByRole("region", {
      name: "Deal completion summary",
    });
    expect(within(summary).getByText("Seller Name")).toBeInTheDocument();
    expect(
      screen
        .getAllByText("Seller Name")
        .filter((node) => !summary.contains(node)),
    ).toHaveLength(2);
    expect(screen.queryByText("#12")).not.toBeInTheDocument();
    expect(screen.getByText("Seller · Seller Name offer")).toBeInTheDocument();
    expect(screen.queryByText("seller@example.test")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Accept offer" }),
    );
    await waitFor(() =>
      expect(mocks.respondToOffer).toHaveBeenCalledWith(40, 71, "accept"),
    );
  });

  it("shows private deal documents and presents an empty state when there are none", async () => {
    renderWithProviders("/buyer/deals/40");
    expect(
      await screen.findByRole("heading", { name: "Deal room documents" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No deal room documents"),
    ).toBeInTheDocument();
    expect(mocks.listDealDocuments).toHaveBeenCalledWith(40, 1, 100);
  });

  it("validates and confirms a new offer before sending it", async () => {
    const user = userEvent.setup();
    mocks.listOffers.mockResolvedValue({
      offers: [],
      pagination: { ...page, total: 0 },
    });
    mocks.createOffer.mockResolvedValue({ ...offer, created_by: 11 });
    renderWithProviders("/buyer/deals/40");

    await user.click(
      await screen.findByRole("button", { name: "Submit offer" }),
    );
    expect(
      await screen.findByText("Enter an amount with up to two decimal places."),
    ).toBeInTheDocument();
    expect(mocks.createOffer).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Offer amount"), "420000.25");
    await user.type(
      screen.getByLabelText(/Terms or note/),
      "Subject to due diligence",
    );
    await user.click(screen.getByRole("button", { name: "Submit offer" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/420,000\.25/)).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Submit offer" }),
    );
    await waitFor(() =>
      expect(mocks.createOffer).toHaveBeenCalledWith(40, {
        amount: "420000.25",
        currency: "EUR",
        message: "Subject to due diligence",
      }),
    );
  });
});

it("refreshes an accepted closing room when the participant returns to the tab", async () => {
  const acceptedDeal = {
    ...deal,
    status: "accepted",
    accepted_at: "2026-10-21T13:00:00.000Z",
    agreed_offer: { amount: "450000.00", currency: "EUR" },
    closing_revision: 1,
    closing_amount: "450000.00",
    closing_currency: "EUR",
    closing_proposed_by: 11,
  };
  mocks.getDeal.mockResolvedValue(acceptedDeal);
  renderWithProviders("/buyer/deals/40");
  await screen.findByText("Waiting for the other participant to agree.");
  mocks.getDeal.mockResolvedValue({
    ...acceptedDeal,
    closing_agreed_at: "2026-10-21T14:00:00.000Z",
  });
  try {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    expect(
      await screen.findByRole("button", { name: "Confirm completion" }),
    ).toBeVisible();
  } finally {
    focusManager.setFocused(undefined);
  }
});
