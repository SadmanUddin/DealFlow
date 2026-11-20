import { ArrowUpRight } from "lucide-react";
import { Link, NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useState } from "react";

const navigation = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why DealFlow", href: "/#benefits" },
];

export function SiteHeader() {
  const { user, isLoading, isSigningOut, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await logout();
    } catch {
      setLogoutError("Sign out could not be confirmed. Please try again.");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-xl">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-6">
        <Link
          aria-label="DealFlow home"
          className="brand-lockup shrink-0"
          to="/"
        >
          <img
            alt=""
            className="brand-symbol-tile h-10 w-10 sm:h-11 sm:w-11"
            height="1024"
            src="/brand/dealflow-symbol-recraft.png"
            width="1024"
          />
          <img
            alt=""
            className="brand-wordmark h-8 w-[6.75rem] sm:w-[8.25rem]"
            height="768"
            src="/brand/dealflow-wordmark-dark.svg"
            width="1536"
          />
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-8 md:flex"
        >
          {navigation.map((item) => (
            <a
              className="text-sm font-medium text-ink-soft transition hover:text-ink"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <span
              aria-live="polite"
              className="hidden text-xs text-ink-faint sm:inline"
            >
              Checking session…
            </span>
          ) : user ? (
            <>
              <NavLink
                className="hidden px-3 py-2 text-sm font-medium text-ink-soft transition hover:text-ink sm:inline-flex"
                to="/account"
              >
                My account
              </NavLink>
              <Button
                disabled={isSigningOut}
                onClick={() => void handleLogout()}
                size="sm"
                variant="outline"
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : (
            <>
              <NavLink
                className="px-2 py-2 text-sm font-medium text-ink-soft transition hover:text-ink sm:px-3"
                to="/login"
              >
                Sign in
              </NavLink>
              <Button asChild size="sm">
                <Link to="/register">
                  Create account
                  <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {logoutError && (
        <p
          aria-live="polite"
          className="absolute right-4 top-full rounded-b-lg bg-red-50 px-4 py-2 text-xs text-red-800 shadow"
          role="alert"
        >
          {logoutError}
        </p>
      )}
    </header>
  );
}
