import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import { RequireAuth } from "@/features/auth/RouteGuards";
import * as adminApi from "./api";
import { AdminAuditPage } from "./AdminAuditPage";
import { AdminModerationPage } from "./AdminModerationPage";
import { AdminOverviewPage } from "./AdminOverviewPage";
import { AdminReportsPage } from "./AdminReportsPage";
import { AdminUserDetailPage } from "./AdminUserDetailPage";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAdminDashboard: vi.fn(),
  listAdminUsers: vi.fn(),
  getAdminUser: vi.fn(),
  changeAdminUserStatus: vi.fn(),
  changeAdminUserRole: vi.fn(),
  revokeAdminUserSessions: vi.fn(),
  listAdminListings: vi.fn(),
  getAdminListingHistory: vi.fn(),
  moderateAdminListing: vi.fn(),
  changeAdminListingAvailability: vi.fn(),
  listAdminReports: vi.fn(),
  updateAdminReport: vi.fn(),
  listAuditLogs: vi.fn(),
}));

const adminAuth: AuthContextValue = {
  user: {
    id: 4,
    email: "admin@example.test",
    name: "Admin Example",
    role: "admin",
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
const pageMeta = (total: number) => ({
  page: 1,
  limit: 20,
  total,
  totalPages: Math.ceil(total / 20),
});
const userRecord = {
  id: 18,
  name: "Seller One",
  email: "seller@example.test",
  role: "seller" as const,
  emailVerified: true,
  isActive: true,
  suspensionReason: null,
  suspendedAt: null,
  suspendedBy: null,
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
};
const listing = {
  id: 41,
  sellerId: 18,
  title: "Regional logistics firm",
  description:
    "A profitable regional logistics company with long-term customers.",
  industry: "Logistics",
  location: "Antwerp, Belgium",
  status: "pending" as const,
  moderationReason: null,
  moderatedBy: null,
  moderatedAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};
const report = {
  id: 13,
  reporterId: 6,
  listingId: 41,
  reportedUserId: null,
  category: "misleading_information" as const,
  description:
    "The financial description appears inconsistent with the details provided.",
  status: "pending" as const,
  moderatorNotes: null,
  resolutionReason: null,
  assignedTo: null,
  resolvedBy: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  resolvedAt: null,
};

function renderPage(path: string, page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={adminAuth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin" element={page} />
            <Route path="/admin/users" element={page} />
            <Route path="/admin/users/:id" element={page} />
            <Route path="/admin/moderation" element={page} />
            <Route path="/admin/reports" element={page} />
            <Route path="/admin/audit" element={page} />
            <Route path="/unauthorized" element={<p>Unauthorized</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.getAdminDashboard)
    .mockReset()
    .mockResolvedValue({
      users: { total: 60, active: 58, suspended: 2, buyers: 37, sellers: 20 },
      listings: {
        total: 18,
        pending: 3,
        published: 12,
        rejected: 1,
        suspended: 1,
      },
      reports: { open: 2, recentlyResolved: 4 },
      recentActions: [
        {
          id: 7,
          actorId: 4,
          action: "listing.approved",
          targetType: "listing",
          targetId: "41",
          createdAt: "2026-11-08T10:00:00.000Z",
        },
      ],
    });
  vi.mocked(adminApi.listAdminUsers)
    .mockReset()
    .mockResolvedValue({ users: [userRecord], pagination: pageMeta(1) });
  vi.mocked(adminApi.getAdminUser)
    .mockReset()
    .mockResolvedValue({ user: userRecord, activeSessionCount: 2 });
  vi.mocked(adminApi.changeAdminUserStatus)
    .mockReset()
    .mockResolvedValue({
      user: { ...userRecord, isActive: false },
      activeSessionCount: 0,
    });
  vi.mocked(adminApi.changeAdminUserRole)
    .mockReset()
    .mockResolvedValue({
      user: { ...userRecord, role: "buyer" },
      activeSessionCount: 0,
    });
  vi.mocked(adminApi.revokeAdminUserSessions)
    .mockReset()
    .mockResolvedValue({ revokedCount: 2 });
  vi.mocked(adminApi.listAdminListings)
    .mockReset()
    .mockResolvedValue({ listings: [listing], pagination: pageMeta(1) });
  vi.mocked(adminApi.getAdminListingHistory)
    .mockReset()
    .mockResolvedValue({
      auditLogs: [
        {
          id: 81,
          actorId: 4,
          action: "listing.rejected",
          targetType: "listing",
          targetId: "41",
          reason: "Missing evidence",
          before: { status: "pending" },
          after: { status: "rejected" },
          requestId: "req-history",
          createdAt: "2026-11-08T10:00:00.000Z",
        },
      ],
      pagination: pageMeta(1),
    });
  vi.mocked(adminApi.moderateAdminListing)
    .mockReset()
    .mockResolvedValue({
      listing: {
        id: 41,
        status: "published",
        moderatedAt: "2026-11-08T10:00:00.000Z",
      },
    });
  vi.mocked(adminApi.changeAdminListingAvailability)
    .mockReset()
    .mockResolvedValue({ listing: { id: 41, status: "suspended" } });
  vi.mocked(adminApi.listAdminReports)
    .mockReset()
    .mockResolvedValue({ reports: [report], pagination: pageMeta(1) });
  vi.mocked(adminApi.updateAdminReport)
    .mockReset()
    .mockResolvedValue({
      report: {
        id: 13,
        status: "under_review",
        assignedTo: 4,
        resolvedBy: null,
        resolvedAt: null,
        auditId: 9,
      },
    });
  vi.mocked(adminApi.listAuditLogs)
    .mockReset()
    .mockResolvedValue({
      auditLogs: [
        {
          id: 9,
          actorId: 4,
          action: "user.suspended",
          targetType: "user",
          targetId: "18",
          reason: "Policy violation review",
          before: { status: "active" },
          after: { status: "suspended" },
          requestId: "req-a1",
          createdAt: "2026-11-08T10:00:00.000Z",
        },
      ],
      pagination: pageMeta(1),
    });
});

describe("admin workspace", () => {
  it("renders the real current dashboard snapshot and recent activity", async () => {
    renderPage("/admin", <AdminOverviewPage />);
    expect(await screen.findByText("Open reports")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("listing approved")).toBeInTheDocument();
    expect(screen.getByText(/registration trends/i)).toBeInTheDocument();
    expect(await screen.findByText("Listings by industry")).toBeInTheDocument();
    expect(screen.getByText("Listings by location")).toBeInTheDocument();
  });

  it("searches users, reflects filters in the URL, and opens account details", async () => {
    const user = userEvent.setup();
    renderPage("/admin/users", <AdminUsersPage />);
    expect(
      (await screen.findAllByText("seller@example.test")).length,
    ).toBeGreaterThan(0);
    await user.type(
      screen.getByRole("textbox", { name: /search users/i }),
      "seller",
    );
    await user.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() =>
      expect(adminApi.listAdminUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "seller" }),
      ),
    );
    expect(screen.getByRole("link", { name: "Seller One" })).toHaveAttribute(
      "href",
      "/admin/users/18",
    );
  });

  it("requires an audited reason and confirms account suspension before sending", async () => {
    const user = userEvent.setup();
    renderPage("/admin/users/18", <AdminUserDetailPage />);
    expect(await screen.findByText("Active sessions")).toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: "Reason" });
    const suspend = screen.getByRole("button", { name: /suspend account/i });
    expect(suspend).toBeDisabled();
    await user.type(reason, "Policy violation");
    await user.click(suspend);
    expect(
      screen.getByRole("alertdialog", { name: /suspend this account/i }),
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /suspend account/i,
      }),
    );
    await waitFor(() =>
      expect(adminApi.changeAdminUserStatus).toHaveBeenCalledWith(18, {
        action: "suspend",
        reason: "Policy violation",
      }),
    );
  });

  it("requires a rejection reason and confirms a pending listing decision", async () => {
    const user = userEvent.setup();
    renderPage("/admin/moderation", <AdminModerationPage />);
    expect(
      await screen.findByText("Regional logistics firm"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reject/i }));
    const dialog = screen.getByRole("alertdialog", { name: /reject listing/i });
    expect(
      within(dialog).getByRole("button", { name: /reject listing/i }),
    ).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", {
        name: /reason for administrative action/i,
      }),
      "Missing supporting evidence",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /reject listing/i }),
    );
    await waitFor(() =>
      expect(adminApi.moderateAdminListing).toHaveBeenCalledWith(41, {
        action: "reject",
        rejectionReason: "Missing supporting evidence",
      }),
    );
  });

  it("loads and displays moderation history from the audit endpoint", async () => {
    const user = userEvent.setup();
    renderPage("/admin/moderation", <AdminModerationPage />);
    await screen.findByText("Regional logistics firm");
    await user.click(
      screen.getByRole("button", { name: /moderation history/i }),
    );
    expect(await screen.findByText("listing rejected")).toBeInTheDocument();
    expect(screen.getByText("Missing evidence")).toBeInTheDocument();
    expect(adminApi.getAdminListingHistory).toHaveBeenCalledWith(41);
  });

  it("shows a retryable failure when user data is unavailable", async () => {
    vi.mocked(adminApi.listAdminUsers)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ users: [userRecord], pagination: pageMeta(1) });
    renderPage("/admin/users", <AdminUsersPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      (await screen.findAllByText("seller@example.test")).length,
    ).toBeGreaterThan(0);
  });

  it("updates report status only after capturing the audit reason", async () => {
    const user = userEvent.setup();
    renderPage("/admin/reports", <AdminReportsPage />);
    expect(await screen.findByText(report.description)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /assign to me/i }));
    const dialog = screen.getByRole("alertdialog", {
      name: /begin report review/i,
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Audit reason" }),
      "Taking ownership for review",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /assign and review/i }),
    );
    await waitFor(() =>
      expect(adminApi.updateAdminReport).toHaveBeenCalledWith(13, {
        status: "under_review",
        reason: "Taking ownership for review",
      }),
    );
  });

  it("filters the paginated audit log and omits raw before/after state", async () => {
    const user = userEvent.setup();
    renderPage("/admin/audit", <AdminAuditPage />);
    expect(await screen.findByText("user suspended")).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /filter by action name/i }),
      "listing.approved",
    );
    await user.click(screen.getByRole("button", { name: /apply/i }));
    await waitFor(() =>
      expect(adminApi.listAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "listing.approved" }),
      ),
    );
    expect(screen.queryByText(/"status"/i)).not.toBeInTheDocument();
    expect(screen.getByText("Policy violation review")).toBeInTheDocument();
  });

  it("keeps the administrative route restricted to admins", async () => {
    const buyer = {
      ...adminAuth,
      user: { ...adminAuth.user!, role: "buyer" as const },
    };
    render(
      <AuthContext.Provider value={buyer}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route
              path="/admin"
              element={
                <RequireAuth roles={["admin"]}>
                  <p>Admin content</p>
                </RequireAuth>
              }
            />
            <Route path="/unauthorized" element={<p>Unauthorized</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });
});
