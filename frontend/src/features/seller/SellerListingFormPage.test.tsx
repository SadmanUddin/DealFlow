import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerListingFormPage } from "./SellerListingFormPage";
import type { SellerListing } from "./api";

const mocks = vi.hoisted(() => ({
  getMyListing: vi.fn(),
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

function renderEditor(path = "/seller/listings/5/edit") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/seller/listings/new"
            element={<SellerListingFormPage />}
          />
          <Route path="/seller/listings" element={<p>Seller listings</p>} />
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
    mocks.getMyListing.mockResolvedValue({
      listing,
    });
  });

  it("shows the uploaded preview, explains reapproval, and permits another image change while pending", async () => {
    const user = userEvent.setup();
    let currentListing: SellerListing = listing;
    mocks.getMyListing.mockImplementation(async () => ({
      listing: currentListing,
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
    await waitFor(() => expect(mocks.getMyListing).toHaveBeenCalledTimes(2));
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

  it("preserves unsaved draft edits after an image change refetches the listing", async () => {
    const user = userEvent.setup();
    const draft = { ...listing, status: "draft" as const };
    mocks.getMyListing.mockResolvedValue({ listing: draft });
    mocks.uploadListingImage.mockImplementation(async () => {
      const imageUrl = "/api/listings/5/image?v=new";
      mocks.getMyListing.mockResolvedValue({ listing: { ...draft, imageUrl } });
      return { imageUrl, status: "draft" };
    });
    mocks.updateListing.mockResolvedValue({ listing: draft });
    renderEditor();
    const title = await screen.findByRole("textbox", { name: "Business name" });
    await user.clear(title);
    await user.type(title, "Updated roastery");
    await user.upload(
      await screen.findByLabelText("Upload or replace image"),
      new File(["image"], "draft.png", { type: "image/png" }),
    );
    await waitFor(() => expect(mocks.getMyListing).toHaveBeenCalledTimes(2));
    await screen.findByText("Image uploaded.");
    expect(title).toHaveValue("Updated roastery");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Seller listings")).toBeInTheDocument();
    expect(mocks.updateListing).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ title: "Updated roastery" }),
    );
  });

  it("announces field validation and saves new businesses as drafts", async () => {
    const user = userEvent.setup();
    mocks.createListing.mockResolvedValue({
      listing: { ...listing, status: "draft" },
    });
    mocks.getMyListing.mockResolvedValue({
      listing: { ...listing, status: "draft" },
    });
    renderEditor("/seller/listings/new");
    const title = screen.getByRole("textbox", { name: "Business name" });
    await user.type(title, "AB");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("Enter at least 3 characters."),
    ).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(mocks.createListing).not.toHaveBeenCalled();
    await user.type(title, " Roasters");
    await user.type(
      screen.getByRole("textbox", { name: "Business description" }),
      "A neighborhood coffee roasting business.",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Asking price" }),
      "125000.50",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("Draft saved. You can now add a listing image."),
    ).toBeInTheDocument();
    expect(mocks.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        asking_price: "125000.50",
        annual_revenue: null,
      }),
    );
  });
});
