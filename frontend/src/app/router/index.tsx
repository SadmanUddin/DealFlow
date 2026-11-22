import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { LoadingState } from "@/components/shared/LoadingState";
import { MarketingLayout } from "@/components/shared/MarketingLayout";
import { NotFoundPage } from "@/features/landing/NotFoundPage";
import { LandingPage } from "@/features/landing/LandingPage";
import { AudienceLandingPage } from "@/features/landing/AudienceLandingPage";
import { RouteErrorPage } from "@/features/landing/RouteErrorPage";
import {
  RequireAuth,
  RequireGuest,
  UnauthorizedPage,
} from "@/features/auth/RouteGuards";
import { WorkspaceLayout } from "@/components/shared/workspace/WorkspaceLayout";

const AccountPage = lazy(() =>
  import("@/features/account/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
);
const LoginPage = lazy(() =>
  import("@/features/auth/AuthPages").then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  import("@/features/auth/AuthPages").then((module) => ({
    default: module.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/features/auth/AuthPages").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@/features/auth/AuthPages").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import("@/features/auth/AuthPages").then((module) => ({
    default: module.VerifyEmailPage,
  })),
);
const MarketplacePage = lazy(() =>
  import("@/features/marketplace/MarketplacePage").then((module) => ({
    default: module.MarketplacePage,
  })),
);
const ListingDetailsPage = lazy(() =>
  import("@/features/marketplace/ListingDetailsPage").then((module) => ({
    default: module.ListingDetailsPage,
  })),
);
const BuyerOverviewPage = lazy(() =>
  import("@/features/buyer/BuyerOverviewPage").then((module) => ({
    default: module.BuyerOverviewPage,
  })),
);
const BuyerSavedPage = lazy(() =>
  import("@/features/buyer/BuyerSavedPage").then((module) => ({
    default: module.BuyerSavedPage,
  })),
);
const BuyerConversationsPage = lazy(() =>
  import("@/features/buyer/BuyerConversationsPage").then((module) => ({
    default: module.BuyerConversationsPage,
  })),
);
const BuyerOffersPage = lazy(() =>
  import("@/features/buyer/BuyerOffersPage").then((module) => ({
    default: module.BuyerOffersPage,
  })),
);
const BuyerDealsPage = lazy(() =>
  import("@/features/buyer/BuyerDealsPage").then((module) => ({
    default: module.BuyerDealsPage,
  })),
);
const DealDetailPage = lazy(() =>
  import("@/features/deals/DealDetailPage").then((module) => ({
    default: module.DealDetailPage,
  })),
);
const BuyerNotificationsPage = lazy(() =>
  import("@/features/buyer/BuyerNotificationsPage").then((module) => ({
    default: module.BuyerNotificationsPage,
  })),
);
const BuyerAnalyticsPage = lazy(() =>
  import("@/features/buyer/BuyerAnalyticsPage").then((module) => ({
    default: module.BuyerAnalyticsPage,
  })),
);
const SellerOverviewPage = lazy(() =>
  import("@/features/seller/SellerOverviewPage").then((module) => ({
    default: module.SellerOverviewPage,
  })),
);
const SellerListingsPage = lazy(() =>
  import("@/features/seller/SellerListingsPage").then((module) => ({
    default: module.SellerListingsPage,
  })),
);
const SellerListingFormPage = lazy(() =>
  import("@/features/seller/SellerListingFormPage").then((module) => ({
    default: module.SellerListingFormPage,
  })),
);
const SellerInquiriesPage = lazy(() =>
  import("@/features/seller/SellerInquiriesPage").then((module) => ({
    default: module.SellerInquiriesPage,
  })),
);
const SellerInquiryDetailPage = lazy(() =>
  import("@/features/seller/SellerInquiryDetailPage").then((module) => ({
    default: module.SellerInquiryDetailPage,
  })),
);
const SellerConversationsPage = lazy(() =>
  import("@/features/seller/SellerConversationsPage").then((module) => ({
    default: module.SellerConversationsPage,
  })),
);
const SellerOffersPage = lazy(() =>
  import("@/features/seller/SellerOffersPage").then((module) => ({
    default: module.SellerOffersPage,
  })),
);
const SellerDocumentsPage = lazy(() =>
  import("@/features/seller/SellerDocumentsPage").then((module) => ({
    default: module.SellerDocumentsPage,
  })),
);
const SellerAnalyticsPage = lazy(() =>
  import("@/features/seller/SellerAnalyticsPage").then((module) => ({
    default: module.SellerAnalyticsPage,
  })),
);
const AdminOverviewPage = lazy(() =>
  import("@/features/admin/AdminOverviewPage").then((module) => ({
    default: module.AdminOverviewPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import("@/features/admin/AdminUsersPage").then((module) => ({
    default: module.AdminUsersPage,
  })),
);
const AdminUserDetailPage = lazy(() =>
  import("@/features/admin/AdminUserDetailPage").then((module) => ({
    default: module.AdminUserDetailPage,
  })),
);
const AdminModerationPage = lazy(() =>
  import("@/features/admin/AdminModerationPage").then((module) => ({
    default: module.AdminModerationPage,
  })),
);
const AdminReportsPage = lazy(() =>
  import("@/features/admin/AdminReportsPage").then((module) => ({
    default: module.AdminReportsPage,
  })),
);
const AdminAuditPage = lazy(() =>
  import("@/features/admin/AdminAuditPage").then((module) => ({
    default: module.AdminAuditPage,
  })),
);

function lazyPage(element: React.ReactNode) {
  return (
    <Suspense fallback={<LoadingState label="Loading DealFlow" />}>
      {element}
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <MarketingLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "marketplace", element: lazyPage(<MarketplacePage />) },
      { path: "listings/:id", element: lazyPage(<ListingDetailsPage />) },
      {
        path: "account",
        element: lazyPage(
          <RequireAuth>
            <AccountPage />
          </RequireAuth>,
        ),
      },
      { path: "unauthorized", element: <UnauthorizedPage /> },
      {
        path: "buyers",
        element: <AudienceLandingPage audience="buyers" />,
      },
      {
        path: "sellers",
        element: <AudienceLandingPage audience="sellers" />,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "/login",
    element: lazyPage(
      <RequireGuest>
        <LoginPage />
      </RequireGuest>,
    ),
  },
  {
    path: "/register",
    element: lazyPage(
      <RequireGuest>
        <RegisterPage />
      </RequireGuest>,
    ),
  },
  {
    path: "/forgot-password",
    element: lazyPage(
      <RequireGuest>
        <ForgotPasswordPage />
      </RequireGuest>,
    ),
  },
  { path: "/reset-password", element: lazyPage(<ResetPasswordPage />) },
  { path: "/verify-email", element: lazyPage(<VerifyEmailPage />) },
  {
    path: "/buyer",
    element: lazyPage(
      <RequireAuth roles={["buyer"]}>
        <WorkspaceLayout role="buyer" />
      </RequireAuth>,
    ),
    children: [
      { index: true, element: lazyPage(<BuyerOverviewPage />) },
      { path: "saved", element: lazyPage(<BuyerSavedPage />) },
      { path: "conversations", element: lazyPage(<BuyerConversationsPage />) },
      { path: "offers", element: lazyPage(<BuyerOffersPage />) },
      { path: "deals", element: lazyPage(<BuyerDealsPage />) },
      { path: "deals/:id", element: lazyPage(<DealDetailPage />) },
      { path: "notifications", element: lazyPage(<BuyerNotificationsPage />) },
      { path: "analytics", element: lazyPage(<BuyerAnalyticsPage />) },
    ],
  },
  {
    path: "/seller",
    element: lazyPage(
      <RequireAuth roles={["seller"]}>
        <WorkspaceLayout role="seller" />
      </RequireAuth>,
    ),
    children: [
      { index: true, element: lazyPage(<SellerOverviewPage />) },
      { path: "listings", element: lazyPage(<SellerListingsPage />) },
      { path: "listings/new", element: lazyPage(<SellerListingFormPage />) },
      {
        path: "listings/:id/edit",
        element: lazyPage(<SellerListingFormPage />),
      },
      { path: "inquiries", element: lazyPage(<SellerInquiriesPage />) },
      { path: "inquiries/:id", element: lazyPage(<SellerInquiryDetailPage />) },
      { path: "conversations", element: lazyPage(<SellerConversationsPage />) },
      { path: "deals", element: lazyPage(<SellerOffersPage />) },
      { path: "deals/:id", element: lazyPage(<DealDetailPage />) },
      { path: "notifications", element: lazyPage(<BuyerNotificationsPage />) },
      { path: "documents", element: lazyPage(<SellerDocumentsPage />) },
      { path: "analytics", element: lazyPage(<SellerAnalyticsPage />) },
    ],
  },
  {
    path: "/admin",
    element: lazyPage(
      <RequireAuth roles={["admin"]}>
        <WorkspaceLayout role="admin" />
      </RequireAuth>,
    ),
    children: [
      { index: true, element: lazyPage(<AdminOverviewPage />) },
      { path: "users", element: lazyPage(<AdminUsersPage />) },
      { path: "users/:id", element: lazyPage(<AdminUserDetailPage />) },
      { path: "moderation", element: lazyPage(<AdminModerationPage />) },
      { path: "reports", element: lazyPage(<AdminReportsPage />) },
      { path: "audit", element: lazyPage(<AdminAuditPage />) },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
