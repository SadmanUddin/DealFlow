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
        element: <PlaceholderPage audience="buyers" />,
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
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
