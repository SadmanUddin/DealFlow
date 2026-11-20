import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { LoadingState } from "@/components/shared/LoadingState";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "./useAuth";
import type { UserRole } from "./types";

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const { user, isLoading, initializationError, refreshSession } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingState label="Restoring your session" />;
  if (initializationError) {
    const rateLimited = toApiError(initializationError).status === 429;
    return (
      <section className="mx-auto grid min-h-[60vh] max-w-lg place-content-center px-6 text-center">
        <h1 className="text-xl font-semibold text-navy-950">
          We couldn’t check your session
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {rateLimited
            ? "Too many session checks were made. Wait a moment before trying again."
            : "Check your connection and try again."}
        </p>
        {!rateLimited && (
          <button
            className="mt-5 text-sm font-semibold text-emerald-800 underline"
            onClick={() => void refreshSession()}
            type="button"
          >
            Try again
          </button>
        )}
      </section>
    );
  }
  if (!user) {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <Navigate replace to="/unauthorized" state={{ requiredRoles: roles }} />
    );
  }
  return children;
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, isLoading, initializationError } = useAuth();
  if (isLoading) return <LoadingState label="Checking your session" />;
  if (initializationError) return children;
  if (user) return <Navigate replace to="/account" />;
  return children;
}

export function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <section className="mx-auto grid min-h-[60vh] max-w-lg content-center px-6 text-center">
      <p className="eyebrow text-emerald-800">Access restricted</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-950">
        This area isn’t available to your account
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        {user
          ? `Your ${user.role} account does not have access to this area.`
          : "Sign in with an account that has access."}
      </p>
    </section>
  );
}
