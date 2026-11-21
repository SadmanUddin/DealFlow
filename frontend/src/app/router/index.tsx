import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { LoadingState } from "@/components/shared/LoadingState";
import { MarketingLayout } from "@/components/shared/MarketingLayout";
import { NotFoundPage } from "@/features/landing/NotFoundPage";
import { LandingPage } from "@/features/landing/LandingPage";
import { PlaceholderPage } from "@/features/landing/PlaceholderPage";
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
        element: lazyPage(<MarketplacePage />),
      },
      {
        path: "sellers",
        element: <PlaceholderPage audience="sellers" />,
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
      { path: "offers", element: lazyPage(<BuyerOffersPage />) },
      { path: "deals", element: lazyPage(<BuyerDealsPage />) },
      { path: "notifications", element: lazyPage(<BuyerNotificationsPage />) },
      { path: "analytics", element: lazyPage(<BuyerAnalyticsPage />) },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
