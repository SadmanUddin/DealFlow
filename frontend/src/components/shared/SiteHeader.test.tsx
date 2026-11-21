import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { authQueryKeys } from "@/features/auth/api";
import { MarketplacePage } from "@/features/marketplace/MarketplacePage";
import { SiteHeader } from "./SiteHeader";

const mocks = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  signOut: vi.fn(),
  getPublicListings: vi.fn(),
}));

vi.mock("@/features/auth/api", () => ({
  authQueryKeys: { session: ["auth", "session"], profile: ["auth", "profile"] },
  normalizeAuthError: (error: unknown) => error,
  restoreSession: mocks.restoreSession,
  signIn: vi.fn(),
  signOut: mocks.signOut,
  signUp: vi.fn(),
}));

vi.mock("@/features/marketplace/marketplace-api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/marketplace/marketplace-api")
    >();
  return { ...actual, getPublicListings: mocks.getPublicListings };
});

const user = {
  id: 19,
  email: "buyer@example.com",
  role: "buyer" as const,
  emailVerified: true,
};

const page = {
  listings: [
    {
      id: 8,
      title: "Independent neighborhood bakery",
      description: "A popular established bakery.",
      industry: "Food & Beverage",
      location: "Ghent, Belgium",
      askingPrice: "485000.00",
      annualRevenue: "620000.00",
      ebitda: null,
      currency: "EUR",
      publishedAt: null,
      createdAt: "2026-10-10T12:00:00.000Z",
    },
  ],
  pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
};

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(["private", "profile"], { secret: "private" });
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/marketplace"]}>
          <SiteHeader />
          <CurrentPath />
          <Routes>
            <Route element={<MarketplacePage />} path="/marketplace" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  mocks.restoreSession.mockReset().mockResolvedValue(user);
  mocks.signOut.mockReset().mockResolvedValue({ message: "Signed out" });
  mocks.getPublicListings.mockReset().mockResolvedValue(page);
});

describe("public navigation and logout", () => {
  it("opens an accessible logout confirmation and cancellation keeps the session", async () => {
    const userActions = userEvent.setup();
    renderApp();
    await screen.findByRole("link", { name: "My workspace" });
    await userActions.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = screen.getByRole("alertdialog", { name: "Sign out?" });
    expect(dialog).toHaveTextContent(
      "Are you sure you want to sign out of your DealFlow account?",
    );
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await userActions.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Sign out" }),
    );
    await userActions.keyboard("{Tab}");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await userActions.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "My workspace" }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Sign out" }),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("confirms logout, clears private cached data, and keeps the public marketplace available", async () => {
    const userActions = userEvent.setup();
    const { client } = renderApp();
    await screen.findByRole("link", { name: "My workspace" });
    await screen.findByRole("link", {
      name: /view independent neighborhood bakery/i,
    });
    await userActions.click(screen.getByRole("button", { name: "Sign out" }));
    await userActions.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sign out",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My workspace" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent(
      "/marketplace",
    );
    expect(
      screen.getByRole("link", {
        name: /view independent neighborhood bakery/i,
      }),
    ).toBeInTheDocument();
    expect(client.getQueryData(["private", "profile"])).toBeUndefined();
    expect(client.getQueryData(authQueryKeys.session)).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog and authenticated navigation when logout fails", async () => {
    const userActions = userEvent.setup();
    mocks.signOut.mockRejectedValueOnce(new Error("offline"));
    renderApp();
    await screen.findByRole("link", { name: "My workspace" });
    await userActions.click(screen.getByRole("button", { name: "Sign out" }));
    await userActions.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sign out",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out could not be confirmed",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "My workspace" }),
      ).toBeInTheDocument(),
    );
  });
});
