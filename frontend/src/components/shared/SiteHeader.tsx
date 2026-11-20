import { ArrowUpRight, ChartNoAxesCombined } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Button } from '@/components/ui/button';

const navigation = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Why DealFlow', href: '/#benefits' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-xl">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-6">
        <Link aria-label="DealFlow home" className="brand-lockup" to="/">
          <span className="brand-mark">
            <ChartNoAxesCombined aria-hidden="true" size={19} strokeWidth={2.2} />
          </span>
          <span className="text-[1.1rem] font-semibold tracking-[-0.045em]">
            dealflow<span className="text-emerald-700">.</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {navigation.map(item => (
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
          <NavLink
            className="hidden px-3 py-2 text-sm font-medium text-ink-soft transition hover:text-ink sm:inline-flex"
            to="/sellers"
          >
            Sell a business
          </NavLink>
          <Button asChild size="sm">
            <Link to="/buyers">
              Explore DealFlow
              <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
