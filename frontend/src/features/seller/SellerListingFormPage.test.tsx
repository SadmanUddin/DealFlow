import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerListingFormPage } from "./SellerListingFormPage";
import type { SellerListing } from "./api";

const mocks = vi.hoisted(() => ({
  listMyListings: vi.fn(),
  uploadListingImage: vi.fn(),
  removeListingImage: vi.fn(),
  createListing: vi.fn(),
  updateListing: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...mocks,
}));

const listing = {
  id: 5,
  title: "Harbor Coffee Roasters",
  description: "A profitable neighborhood coffee roasting business.",
  industry: "Food and beverage",
  location: "Ghent",
  website: null,
  imageUrl: "/api/listings/5/image?v=old",
  askingPrice: "400000",
  annualRevenue: "520000",
  ebitda: "84000",
  currency: "EUR",
  publishedAt: "2026-10-01T10:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
  status: "published" as const,
  rejectionReason: null,
  updatedAt: "2026-10-01T10:00:00.000Z",
};

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/seller/listings/5/edit"]}>
        <Routes>
          <Route
            path="/seller/listings/:id/edit"
            element={<SellerListingFormPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("seller listing image workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMyListings.mockResolvedValue({
      listings: [listing],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  it("shows the uploaded preview, explains reapproval, and permits another image change while pending", async () => {
    const user = userEvent.setup();
    let currentListing: SellerListing = listing;
    mocks.listMyListings.mockImplementation(async () => ({
      listings: [currentListing],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    mocks.uploadListingImage.mockImplementation(async () => {
      currentListing = {
        ...listing,
        status: "pending",
        imageUrl: "/api/listings/5/image?v=new",
      };
      return { imageUrl: currentListing.imageUrl, status: "pending" };
    });
    renderEditor();

    const imageInput = await screen.findByLabelText("Upload or replace image");
    expect(imageInput).toBeEnabled();
    await user.upload(
      imageInput,
      new File(["image"], "roastery.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText(/updated image will be public after approval/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.listMyListings).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Upload or replace image")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeEnabled();
    expect(
      screen.getByAltText("Listing image for Harbor Coffee Roasters"),
    ).toHaveAttribute(
      "src",
      "http://localhost:3000/api/listings/5/image?v=new",
    );
  });
});
