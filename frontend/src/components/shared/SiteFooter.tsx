import { Link } from "react-router";
import { useAuth } from "@/features/auth/useAuth";

export function SiteFooter() {
  const { user } = useAuth();
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-white">
      <div className="page-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.9fr] lg:py-14">
        <div>
          <Link
            aria-label="DealFlow home"
            className="inline-flex items-center gap-2.5 rounded-md"
            to="/"
          >
            <img
              className="size-8 rounded-lg"
              width="32"
              height="32"
              alt=""
              src="/brand/dealflow-symbol-recraft.png"
              srcSet="/brand/dealflow-symbol-recraft-96.png 96w, /brand/dealflow-symbol-recraft.png 1024w"
              sizes="40px"
            />
            <span className="text-xl font-semibold tracking-tight">
              DealFlow
            </span>
          </Link>
          <p className="mt-4 max-w-[30ch] text-sm leading-6 text-white/75">
            A marketplace for buying and selling established businesses.
          </p>
        </div>
        <nav
          aria-label="Explore DealFlow"
          className="grid content-start justify-items-start gap-2.5 text-sm text-white/80"
        >
          <h2 className="mb-1 font-semibold text-white">Marketplace</h2>
          <Link className="footer-link" to="/marketplace">
            Available businesses
          </Link>
          <Link className="footer-link" to="/marketplace?availability=sold">
            Sold businesses
          </Link>
          <a className="footer-link" href="/#how-it-works">
            How it works
          </a>
        </nav>
        <nav
          aria-label="Buyer and seller guides"
          className="grid content-start justify-items-start gap-2.5 text-sm text-white/80"
        >
          <h2 className="mb-1 font-semibold text-white">Buying and selling</h2>
          <Link className="footer-link" to="/buyers">
            Buy a business
          </Link>
          <Link className="footer-link" to="/sellers">
            Sell a business
          </Link>
          <a className="footer-link" href="/#benefits">
            Deal privacy
          </a>
        </nav>
        <nav
          aria-label="Account links"
          className="grid content-start justify-items-start gap-2.5 text-sm text-white/80"
        >
          <h2 className="mb-1 font-semibold text-white">Account</h2>
          {user ? (
            <>
              <Link className="footer-link" to={`/${user.role}`}>
                My workspace
              </Link>
              <Link className="footer-link" to="/account">
                Account settings
              </Link>
            </>
          ) : (
            <>
              <Link className="footer-link" to="/login">
                Sign in
              </Link>
              <Link className="footer-link" to="/register">
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
      <div className="border-t border-white/15">
        <div className="page-container py-5 text-xs text-white/65">
          © {new Date().getFullYear()} DealFlow
        </div>
      </div>
    </footer>
  );
}
