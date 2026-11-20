import { Link } from 'react-router';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-white">
      <div className="page-container grid gap-12 py-12 md:grid-cols-[1.5fr_1fr_1fr] md:py-16">
        <div>
          <Link aria-label="DealFlow home" className="brand-lockup rounded-xl bg-white px-2" to="/">
            <img
              alt=""
              className="brand-symbol-tile h-10 w-10"
              height="1024"
              src="/brand/dealflow-symbol-recraft.png"
              width="1024"
            />
            <img
              alt=""
              className="brand-wordmark h-8 w-36"
              height="768"
              src="/brand/dealflow-wordmark-recraft.svg"
              width="1536"
            />
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/60">
            A more considered way to navigate the next chapter of a business.
          </p>
        </div>

        <div>
          <p className="eyebrow text-white/45">Explore</p>
          <div className="mt-4 flex flex-col items-start gap-3 text-sm text-white/75">
            <a className="footer-link" href="/#how-it-works">How it works</a>
            <a className="footer-link" href="/#benefits">Why DealFlow</a>
            <Link className="footer-link" to="/buyers">For buyers</Link>
            <Link className="footer-link" to="/sellers">For sellers</Link>
          </div>
        </div>

        <div>
          <p className="eyebrow text-white/45">Stay connected</p>
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">
            We’re building a thoughtful marketplace for business transitions.
            More ways to connect will follow.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="page-container flex flex-col justify-between gap-2 py-5 text-xs text-white/45 sm:flex-row">
          <span>© {new Date().getFullYear()} DealFlow</span>
          <span>Built for thoughtful business transitions.</span>
        </div>
      </div>
    </footer>
  );
}
