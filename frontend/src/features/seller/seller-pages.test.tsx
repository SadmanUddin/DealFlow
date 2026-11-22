import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import { SellerInquiriesPage } from "./SellerInquiriesPage";
import { SellerInquiryDetailPage } from "./SellerInquiryDetailPage";
import { SellerListingFormPage } from "./SellerListingFormPage";
import { SellerListingsPage } from "./SellerListingsPage";
import { SellerOverviewPage } from "./SellerOverviewPage";
import { SellerOffersPage } from "./SellerOffersPage";
import * as sellerApi from "./api";
import * as dealApi from "@/features/deals/api";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  listMyListings: vi.fn(),
  createListing: vi.fn(),
  updateListing: vi.fn(),
  submitListing: vi.fn(),
  archiveListing: vi.fn(),
  deleteDraftListing: vi.fn(),
  listInquiries: vi.fn(),
  updateInquiryStatus: vi.fn(),
  listInquiryMessages: vi.fn(),
  markInquiryRead: vi.fn(),
  sendInquiryMessage: vi.fn(),
  listInquiryDocuments: vi.fn(),
  uploadInquiryDocument: vi.fn(),
  deleteInquiryDocument: vi.fn(),
  downloadInquiryDocument: vi.fn(),
}));
vi.mock("@/features/deals/api", async (original) => ({
  ...(await original<typeof import("@/features/deals/api")>()),
  listDeals: vi.fn(),
  listOffers: vi.fn(),
  respondToOffer: vi.fn(),
  createOffer: vi.fn(),
}));

const auth: AuthContextValue = {
  user: {
    id: 22,
    email: "seller@example.test",
    name: "Seller Example",
    role: "seller",
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
const page = (total: number) => ({ page: 1, limit: 100, total, totalPages: 1 });
const listing = {
  id: 8,
  title: "Neighborhood bakery",
  description: "An established bakery with a loyal local customer base.",
  industry: "Food & Beverage",
  location: "Ghent, Belgium",
  askingPrice: "485000.00",
  annualRevenue: "620000.00",
  ebitda: "96000.00",
  currency: "EUR",
  publishedAt: null,
  createdAt: "2026-10-14T12:00:00.000Z",
  status: "draft" as const,
  rejectionReason: null,
  updatedAt: "2026-10-14T12:00:00.000Z",
};
const inquiry = {
  id: 7,
  listingId: 8,
  listingTitle: "Neighborhood bakery",
  status: "pending" as const,
  statusUpdatedAt: "2026-10-15T12:00:00.000Z",
  createdAt: "2026-10-14T12:00:00.000Z",
};
const deal = {
  id: 19,
  listing_id: 8,
  buyer_id: 31,
  seller_id: 22,
  status: "negotiating" as const,
  accepted_at: null,
  created_at: "2026-10-14T12:00:00.000Z",
  updated_at: "2026-10-15T12:00:00.000Z",
};
const offer = {
  id: 28,
  deal_id: 19,
  parent_offer_id: null,
  created_by: 31,
  amount: "450000.00",
  currency: "EUR",
  message: "Financing is ready.",
  status: "pending" as const,
  created_at: "2026-10-15T12:00:00.000Z",
  responded_at: null,
};

function renderPage(path: string, element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/seller/listings" element={element} />
            <Route path="/seller" element={element} />
            <Route path="/seller/listings/new" element={element} />
            <Route path="/seller/listings/:id/edit" element={element} />
            <Route path="/seller/inquiries" element={element} />
            <Route path="/seller/inquiries/:id" element={element} />
            <Route path="/seller/deals" element={element} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function renderSellerListingLifecycle(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/seller/listings"
              element={<SellerListingsPage />}
            />
            <Route
              path="/seller/listings/:id/edit"
              element={<SellerListingFormPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(sellerApi.listMyListings)
    .mockReset()
    .mockResolvedValue({ listings: [listing], pagination: page(1) });
  vi.mocked(sellerApi.createListing).mockReset().mockResolvedValue({ listing });
  vi.mocked(sellerApi.updateListing).mockReset().mockResolvedValue({ listing });
  vi.mocked(sellerApi.submitListing)
    .mockReset()
    .mockResolvedValue({ listing: { ...listing, status: "pending" } });
  vi.mocked(sellerApi.archiveListing)
    .mockReset()
    .mockResolvedValue({ listing: { ...listing, status: "archived" } });
  vi.mocked(sellerApi.deleteDraftListing)
    .mockReset()
    .mockResolvedValue({ message: "Draft listing deleted" });
  vi.mocked(sellerApi.listInquiries)
    .mockReset()
    .mockResolvedValue({ conversations: [inquiry], pagination: page(1) });
  vi.mocked(sellerApi.updateInquiryStatus)
    .mockReset()
    .mockResolvedValue({
      inquiry: {
        id: 7,
        listingId: 8,
        status: "in_review",
        statusUpdatedAt: "2026-10-16T12:00:00.000Z",
      },
    });
  vi.mocked(sellerApi.listInquiryMessages)
    .mockReset()
    .mockResolvedValue({
      messages: [
        {
          id: 5,
          conversationId: 7,
          senderId: 31,
          content: "Could you share the latest accounts?",
          createdAt: "2026-10-15T12:00:00.000Z",
          readAt: null,
        },
      ],
      pagination: { limit: 50, hasMore: false, nextCursor: null },
    });
  vi.mocked(sellerApi.markInquiryRead)
    .mockReset()
    .mockResolvedValue({ conversationId: 7, readCount: 1 });
  vi.mocked(sellerApi.sendInquiryMessage)
    .mockReset()
    .mockResolvedValue({
      message: {
        id: 6,
        conversationId: 7,
        senderId: 22,
        content: "I will share the permitted documents.",
        createdAt: "2026-10-16T12:00:00.000Z",
        readAt: null,
      },
    });
  vi.mocked(sellerApi.listInquiryDocuments)
    .mockReset()
    .mockResolvedValue({ documents: [], pagination: page(0) });
  vi.mocked(sellerApi.uploadInquiryDocument)
    .mockReset()
    .mockImplementation(async (_id, file) => ({
      id: 9,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploaderId: 22,
      createdAt: "2026-10-16T12:00:00.000Z",
    }));
  vi.mocked(sellerApi.deleteInquiryDocument)
    .mockReset()
    .mockResolvedValue(true);
  vi.mocked(sellerApi.downloadInquiryDocument)
    .mockReset()
    .mockResolvedValue(new Blob(["private mock file"]));
  vi.mocked(dealApi.listDeals)
    .mockReset()
    .mockResolvedValue({ deals: [deal], pagination: page(1) });
  vi.mocked(dealApi.listOffers)
    .mockReset()
    .mockResolvedValue({ offers: [offer], pagination: page(1) });
  vi.mocked(dealApi.respondToOffer)
    .mockReset()
    .mockResolvedValue({ ...offer, status: "accepted" });
  vi.mocked(dealApi.createOffer)
    .mockReset()
    .mockResolvedValue({
      ...offer,
      id: 29,
      parent_offer_id: 28,
      created_by: 22,
    });
});

describe("seller workspace", () => {
  it("shows real listing status and only submits drafts after the action", async () => {
    const user = userEvent.setup();
    renderPage("/seller/listings", <SellerListingsPage />);
    expect(await screen.findByText("Neighborhood bakery")).toBeInTheDocument();
    expect(screen.getByText("Drafts on this page")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /submit for review/i }),
    );
    await waitFor(() =>
      expect(sellerApi.submitListing).toHaveBeenCalledWith(
        8,
        expect.any(Object),
      ),
    );
  });

  it("keeps the editor reachable for pending image updates while locking business details", async () => {
    const user = userEvent.setup();
    vi.mocked(sellerApi.listMyListings).mockResolvedValue({
      listings: [{ ...listing, status: "pending" }],
      pagination: page(1),
    });
    renderSellerListingLifecycle("/seller/listings");
    await screen.findByText("pending");
    await user.click(screen.getByRole("link", { name: "Edit" }));

    expect(await screen.findByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toBeDisabled();
    expect(screen.getByLabelText("Upload or replace image")).toBeEnabled();
  });

  it("requires a confirmation before deleting a seller draft", async () => {
    const user = userEvent.setup();
    renderPage("/seller/listings", <SellerListingsPage />);
    await screen.findByText("Neighborhood bakery");
    await user.click(
      screen.getByRole("button", { name: "Delete Neighborhood bakery" }),
    );
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(sellerApi.deleteDraftListing).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete draft" }));
    await waitFor(() =>
      expect(sellerApi.deleteDraftListing).toHaveBeenCalledWith(8),
    );
  });

  it("validates listing creation before calling the backend", async () => {
    const user = userEvent.setup();
    renderPage("/seller/listings/new", <SellerListingFormPage />);
    await user.type(screen.getByLabelText("Business name"), "AB");
    await user.type(screen.getByLabelText("Business description"), "Too short");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("Enter at least 3 characters."),
    ).toBeInTheDocument();
    expect(sellerApi.createListing).not.toHaveBeenCalled();
  });

  it("creates a listing after its required fields pass validation", async () => {
    const user = userEvent.setup();
    renderPage("/seller/listings/new", <SellerListingFormPage />);
    await user.type(
      screen.getByLabelText("Business name"),
      "Neighborhood bakery",
    );
    await user.type(
      screen.getByLabelText("Business description"),
      "A well established bakery with a loyal customer base.",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(sellerApi.createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Neighborhood bakery",
          currency: "EUR",
        }),
      ),
    );
  });

  it("filters the inquiry list by status and business name", async () => {
    const user = userEvent.setup();
    renderPage("/seller/inquiries", <SellerInquiriesPage />);
    expect(await screen.findByText("Neighborhood bakery")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Filter inquiries by status"),
      "closed",
    );
    expect(screen.getByText("No matching inquiries")).toBeInTheDocument();
  });

  it("shows buyer messages and changes only to a backend-permitted inquiry status", async () => {
    const user = userEvent.setup();
    renderPage("/seller/inquiries/7", <SellerInquiryDetailPage />);
    expect(
      await screen.findByText("Could you share the latest accounts?"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Move inquiry to"),
      "in_review",
    );
    await waitFor(() =>
      expect(sellerApi.updateInquiryStatus).toHaveBeenCalledWith(
        7,
        "in_review",
      ),
    );
    expect(sellerApi.markInquiryRead).toHaveBeenCalledWith(7);
  });

  it("uploads supported documents through the private authenticated API adapter", async () => {
    const user = userEvent.setup();
    renderPage("/seller/inquiries/7", <SellerInquiryDetailPage />);
    await screen.findByText("Could you share the latest accounts?");
    const file = new File(
      ["business,name\nDealFlow,Bakery\n"],
      "accounts.csv",
      { type: "text/csv" },
    );
    await user.upload(
      screen.getByLabelText("Upload private conversation document"),
      file,
    );
    await waitFor(() =>
      expect(sellerApi.uploadInquiryDocument).toHaveBeenCalledWith(7, file),
    );
  });

  it("requires confirmation before accepting an incoming offer", async () => {
    const user = userEvent.setup();
    renderPage("/seller/deals", <SellerOffersPage />);
    expect(
      await screen.findByText("Current buyer proposal"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(dealApi.respondToOffer).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Accept offer" }));
    await waitFor(() =>
      expect(dealApi.respondToOffer).toHaveBeenCalledWith(19, 28, "accept"),
    );
  });

  it("submits a counteroffer linked to the buyer's pending proposal", async () => {
    const user = userEvent.setup();
    renderPage("/seller/deals", <SellerOffersPage />);
    await screen.findByText("Current buyer proposal");
    await user.type(screen.getByLabelText("Counteroffer amount"), "470000");
    await user.click(
      screen.getByRole("button", { name: "Submit counteroffer" }),
    );
    await waitFor(() =>
      expect(dealApi.createOffer).toHaveBeenCalledWith(
        19,
        expect.objectContaining({
          amount: "470000",
          currency: "EUR",
          parentOfferId: 28,
        }),
      ),
    );
  });

  it("builds seller summary figures from the returned listing, inquiry, and deal records", async () => {
    renderPage("/seller", <SellerOverviewPage />);
    expect(
      await screen.findByRole("heading", { name: "Seller overview" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Pending offers")).toBeInTheDocument();
    expect(screen.getByText("Recent active deals")).toBeInTheDocument();
  });
});
