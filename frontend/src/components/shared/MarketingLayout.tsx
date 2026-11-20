import { Outlet } from 'react-router';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
