import { useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/features/auth/useAuth";
import "./public-navigation.css";

const navigation = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Buy a business", href: "/buyers" },
  { label: "Sell a business", href: "/sellers" },
  { label: "How it works", href: "/#how-it-works" },
];

const publicNavigation = [
  navigation[0],
  navigation[3],
  { label: "Why DealFlow", href: "/#benefits" },
];

function NavigationLinks({
  floating,
  onNavigate,
}: {
  floating: boolean;
  onNavigate?: () => void;
}) {
  const base =
    "inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-ink-soft transition hover:bg-mist hover:text-ink [&.active]:bg-mist [&.active]:font-semibold [&.active]:text-forest";
  return (floating ? publicNavigation : navigation).map(({ label, href }) =>
    href.includes("#") && floating ? (
      <Link className={base} key={href} to={href} onClick={onNavigate}>
        {label}
      </Link>
    ) : href.includes("#") ? (
      <a className={base} key={href} href={href} onClick={onNavigate}>
        {label}
      </a>
    ) : (
      <NavLink className={base} key={href} to={href} onClick={onNavigate}>
        {label}
      </NavLink>
    ),
  );
}

export function SiteHeader({ floating = false }: { floating?: boolean }) {
  const { user, isLoading, isSigningOut, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
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
      <header
        className={
          floating
            ? "public-header sticky z-30"
            : "sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur-xl"
        }
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobileOpen) {
            setMobileOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div
          className={
            floating
              ? "public-header-bar"
              : "page-container flex h-16 items-center justify-between gap-3 lg:h-[4.75rem]"
          }
        >
          <Link
            aria-label="DealFlow home"
            className="brand-lockup shrink-0"
            onClick={() => setMobileOpen(false)}
            to="/"
          >
            <img
              alt=""
              className="size-8 rounded-lg sm:size-9"
              width="36"
              height="36"
              src="/brand/dealflow-symbol-recraft.png"
              srcSet="/brand/dealflow-symbol-recraft-96.png 96w, /brand/dealflow-symbol-recraft.png 1024w"
              sizes="40px"
            />
            <span className="text-lg font-semibold tracking-tight sm:text-xl">
              DealFlow
            </span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-2 lg:flex"
          >
            <NavigationLinks floating={floating} />
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
                  className={`rounded-lg px-2 py-2 text-sm font-medium text-ink-soft transition hover:text-navy-950 sm:px-3 ${floating ? "hidden sm:inline-flex" : ""}`}
                  to="/login"
                >
                  Sign in
                </NavLink>
                {floating ? (
                  <Link
                    className="dealflow-cta dealflow-cta-small hidden sm:inline-flex"
                    to="/register"
                  >
                    <span className="dealflow-cta-label">
                      <span>Create account</span>
                      <span aria-hidden="true">Create account</span>
                    </span>
                    <span className="dealflow-cta-icon">
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </span>
                  </Link>
                ) : (
                  <Button asChild size="sm">
                    <Link className="px-2.5 sm:px-3.5" to="/register">
                      <span className="sm:hidden">Join</span>
                      <span className="hidden sm:inline">Create account</span>
                    </Link>
                  </Button>
                )}
              </>
            )}
            <button
              ref={menuButton}
              aria-expanded={mobileOpen}
              aria-label={
                mobileOpen ? "Close navigation menu" : "Open navigation menu"
              }
              className="grid size-11 place-items-center rounded-lg text-navy-950 transition hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              type="button"
              aria-controls={
                mobileOpen ? "public-mobile-navigation" : undefined
              }
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
            id="public-mobile-navigation"
            className={
              floating
                ? "public-header-menu lg:hidden"
                : "border-t border-line bg-white px-5 py-3 lg:hidden"
            }
          >
            <div className="page-container flex flex-col items-start gap-1">
              <NavigationLinks
                floating={floating}
                onNavigate={() => setMobileOpen(false)}
              />
              {user ? (
                <NavLink
                  className="rounded-md py-2 text-sm font-medium text-ink-soft"
                  onClick={() => setMobileOpen(false)}
                  to={`/${user.role}`}
                >
                  My workspace
                </NavLink>
              ) : floating && !isLoading ? (
                <div className="mt-2 flex w-full flex-wrap gap-2 border-t border-line pt-3 sm:hidden">
                  <Button asChild variant="outline">
                    <Link to="/login" onClick={() => setMobileOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/register" onClick={() => setMobileOpen(false)}>
                      Create account
                    </Link>
                  </Button>
                </div>
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
