import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { ComparisonProvider } from "@/features/marketplace/ComparisonProvider";
import { MarketplacePage } from "@/features/marketplace/MarketplacePage";
import { BuyerSavedSearchesPage } from "./BuyerSavedSearchesPage";
import type { SavedSearch } from "./api";

const api = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  getSavedSearch: vi.fn(),
  createSavedSearch: vi.fn(),
  updateSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getPublicListings: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  ...api,
}));
vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: "buyer" } }),
}));
vi.mock("@/features/marketplace/marketplace-api", async (original) => ({
  ...(await original<
    typeof import("@/features/marketplace/marketplace-api")
  >()),
  getPublicListings: api.getPublicListings,
}));

const search: SavedSearch = {
  id: 5,
  name: "Belgium technology",
  filters: {
    industry: "Tech",
    minPrice: "10000",
    availability: "available",
    sort: "newest",
  },
  alertsEnabled: true,
  frequency: "daily",
  createdAt: "2026-01-02T00:00:00Z",
  updatedAt: "2026-01-03T00:00:00Z",
};
const page = (savedSearches: SavedSearch[]) => ({
  savedSearches,
  pagination: {
    page: 1,
    limit: 20,
    total: savedSearches.length,
    totalPages: savedSearches.length ? 1 : 0,
  },
});

function LocationText() {
  const { pathname, search } = useLocation();
  return <output aria-label="Current route">{pathname + search}</output>;
}

function show(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ComparisonProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationText />
          <Routes>
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route
              path="/buyer/saved-searches"
              element={<BuyerSavedSearchesPage />}
            />
          </Routes>
        </MemoryRouter>
      </ComparisonProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getPublicListings.mockResolvedValue({
    listings: [],
    pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
  });
  api.listSavedSearches.mockResolvedValue(page([search]));
  api.getSavedSearch.mockResolvedValue(search);
  api.createSavedSearch.mockResolvedValue({ savedSearch: search });
  api.updateSavedSearch.mockResolvedValue({ savedSearch: search });
  api.deleteSavedSearch.mockResolvedValue(undefined);
});

it("saves the applied filters and email frequency without saving the results page", async () => {
  const user = userEvent.setup();
  show("/marketplace?industry=Tech&minPrice=10000&page=3");
  await user.click(screen.getByRole("button", { name: "Save this search" }));
  const name = screen.getByRole("textbox", { name: "Search name" });
  expect(name).toHaveFocus();
  await user.type(name, "Tech businesses");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Email frequency" }),
    "weekly",
  );
  await user.click(screen.getByRole("button", { name: "Save search" }));
  await screen.findByRole("link", { name: "Manage saved searches" });
  expect(api.createSavedSearch).toHaveBeenCalledWith({
    name: "Tech businesses",
    alertsEnabled: true,
    frequency: "weekly",
    confirmEmpty: false,
    filters: expect.objectContaining({
      industry: "Tech",
      minPrice: "10000",
      availability: "available",
      sort: "newest",
    }),
  });
  expect(api.createSavedSearch.mock.calls[0][0].filters).not.toHaveProperty(
    "page",
  );
  await user.click(screen.getByRole("link", { name: "Manage saved searches" }));
  expect(
    await screen.findByRole("heading", { name: search.name }),
  ).toBeInTheDocument();
});

it("requires explicit confirmation for unfiltered searches and displays save failures", async () => {
  const user = userEvent.setup();
  api.createSavedSearch.mockRejectedValue(new Error("Fixture failure"));
  show("/marketplace");
  await user.click(screen.getByRole("button", { name: "Save this search" }));
  await user.type(
    screen.getByRole("textbox", { name: "Search name" }),
    "Everything",
  );
  const save = screen.getByRole("button", { name: "Save search" });
  expect(save).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: /without keyword/ }));
  await user.click(save);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Search name" })).toHaveValue(
    "Everything",
  );
});

it("reopens saved criteria, edits through the marketplace, and preserves the edit ID when applying changes", async () => {
  const user = userEvent.setup();
  show("/buyer/saved-searches");
  const reopen = await screen.findByRole("link", {
    name: "View matching businesses",
  });
  expect(reopen).toHaveAttribute(
    "href",
    "/marketplace?industry=Tech&minPrice=10000",
  );
  await user.click(screen.getByRole("link", { name: `Edit ${search.name}` }));
  const name = await screen.findByRole("textbox", { name: "Search name" });
  expect(name).toHaveValue(search.name);
  const industry = screen.getByRole("textbox", { name: "Industry / category" });
  await user.clear(industry);
  await user.type(industry, "Retail");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByLabelText("Current route")).toHaveTextContent(
    "editSavedSearch=5",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Email frequency" }),
    "off",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api.updateSavedSearch).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        frequency: "off",
        filters: expect.objectContaining({
          industry: "Retail",
          minPrice: "10000",
        }),
      }),
    ),
  );
  expect(
    await screen.findByRole("heading", { name: "Saved searches" }),
  ).toBeInTheDocument();
});

it("toggles alerts and confirms deletion before showing the empty state", async () => {
  const user = userEvent.setup();
  api.updateSavedSearch.mockImplementation(async (_id, patch) => {
    const updated = { ...search, ...patch };
    api.listSavedSearches.mockResolvedValue(page([updated]));
    return { savedSearch: updated };
  });
  api.deleteSavedSearch.mockImplementation(async () => {
    api.listSavedSearches.mockResolvedValue(page([]));
  });
  show("/buyer/saved-searches");
  await user.click(
    await screen.findByRole("button", { name: "Disable alerts" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Enable alerts" }),
  );
  await user.click(
    screen.getByRole("button", { name: `Delete ${search.name}` }),
  );
  const dialog = screen.getByRole("alertdialog");
  expect(api.deleteSavedSearch).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.click(
    within(dialog).getByRole("button", { name: "Delete saved search" }),
  );
  expect(await screen.findByText("No saved searches yet")).toBeInTheDocument();
});

it("shows loading and a retryable error when saved searches cannot be read", async () => {
  api.listSavedSearches.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("Fixture failure")), 25);
      }),
  );
  show("/buyer/saved-searches");
  expect(screen.queryByText("No saved searches yet")).not.toBeInTheDocument();
  expect(
    await screen.findByText("Saved searches unavailable"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("heading", { name: search.name }),
  ).toBeInTheDocument();
});
