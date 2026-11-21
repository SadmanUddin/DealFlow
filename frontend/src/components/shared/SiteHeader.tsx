import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/features/auth/useAuth";

const navigation = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why DealFlow", href: "/#benefits" },
];

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navigation.map((item) =>
        item.href === "/marketplace" ? (
          <NavLink
            className="relative rounded-md py-2 text-sm font-medium text-ink-soft transition hover:text-navy-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 after:absolute after:inset-x-0 after:-bottom-[1.24rem] after:h-0.5 after:scale-x-0 after:bg-emerald-600 after:transition-transform md:after:content-[''] [&.active]:font-semibold [&.active]:text-emerald-800 [&.active]:after:scale-x-100"
            key={item.label}
            onClick={onNavigate}
            to={item.href}
          >
            {item.label}
          </NavLink>
        ) : (
          <a
            className="rounded-md py-2 text-sm font-medium text-ink-soft transition hover:text-navy-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20"
            href={item.href}
            key={item.label}
            onClick={onNavigate}
          >
            {item.label}
          </a>
        ),
      )}
    </>
  );
}

export function SiteHeader() {
  const { user, isLoading, isSigningOut, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await logout();
      setLogoutOpen(false);
      setMobileOpen(false);
      navigate("/marketplace", { replace: true });
    } catch {
      setLogoutError(
        "Sign out could not be confirmed. Your session may still be active. Please try again.",
      );
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/90 bg-white/95 backdrop-blur-xl">
        <div className="page-container flex h-[4.35rem] items-center justify-between gap-3 lg:h-[4.75rem]">
          <Link
            aria-label="DealFlow home"
            className="brand-lockup shrink-0"
            to="/"
          >
            <img
              alt=""
              className="brand-symbol-tile h-9 w-9 sm:h-10 sm:w-10"
              height="1024"
              src="/brand/dealflow-symbol-recraft.png"
              width="1024"
            />
            <img
              alt=""
              className="brand-wordmark h-7 w-[6.75rem] sm:w-[7.5rem]"
              height="768"
              src="/brand/dealflow-wordmark-dark.svg"
              width="1536"
            />
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 md:flex"
          >
            <NavigationLinks />
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                  className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-navy-950 transition hover:bg-mist sm:inline-flex"
                  to={`/${user.role}`}
                >
                  My workspace
                </NavLink>
                <Button
                  disabled={isSigningOut}
                  onClick={() => {
                    setLogoutError("");
                    setLogoutOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <NavLink
                  className="rounded-lg px-2 py-2 text-sm font-medium text-ink-soft transition hover:text-navy-950 sm:px-3"
                  to="/login"
                >
                  Sign in
                </NavLink>
                <Button asChild size="sm">
                  <Link className="px-2.5 sm:px-3.5" to="/register">
                    <span className="sm:hidden">Join</span>
                    <span className="hidden sm:inline">Create account</span>
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </Link>
                </Button>
              </>
            )}
            <button
              aria-expanded={mobileOpen}
              aria-label={
                mobileOpen ? "Close navigation menu" : "Open navigation menu"
              }
              className="grid size-9 place-items-center rounded-lg text-navy-950 transition hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              type="button"
            >
              {mobileOpen ? (
                <X aria-hidden="true" size={20} />
              ) : (
                <Menu aria-hidden="true" size={20} />
              )}
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <nav
            aria-label="Mobile navigation"
            className="border-t border-line bg-white px-5 py-3 md:hidden"
          >
            <div className="page-container flex flex-col items-start gap-1">
              <NavigationLinks onNavigate={() => setMobileOpen(false)} />
              {user ? (
                <NavLink
                  className="rounded-md py-2 text-sm font-medium text-ink-soft"
                  onClick={() => setMobileOpen(false)}
                  to={`/${user.role}`}
                >
                  My workspace
                </NavLink>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>
      {logoutOpen ? (
        <ConfirmDialog
          busy={isSigningOut}
          busyLabel="Signing out…"
          confirmLabel="Sign out"
          description="Are you sure you want to sign out of your DealFlow account?"
          error={logoutError}
          onCancel={() => {
            setLogoutError("");
            setLogoutOpen(false);
          }}
          onConfirm={() => void handleLogout()}
          title="Sign out?"
        />
      ) : null}
    </>
  );
}
