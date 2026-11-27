import { Outlet } from "react-router";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-white focus:p-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <SiteHeader floating />
      <main id="main-content" tabIndex={-1} className="min-w-0">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
