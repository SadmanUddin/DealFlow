import { ArrowRight, ArrowUpRight, BadgeCheck, FileText, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

const proofPoints = ['Moderated listings', 'Verified accounts', 'Private deal rooms'];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
      <div aria-hidden="true" className="hero-lines absolute inset-0 -z-10 opacity-60" />

      <div className="page-container grid items-center gap-14 pb-20 pt-14 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-28">
        <div className="animate-fade-up max-w-[38rem]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.18)]" />
            The private marketplace for business acquisitions
          </span>

          <h1 className="mt-7 text-balance text-[clamp(2.6rem,5.6vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
            Buy and sell businesses with{' '}
            <span className="text-emerald-500">confidence.</span>
          </h1>

          <p className="mt-6 max-w-[34rem] text-pretty text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
            DealFlow connects serious acquirers with owners ready for their next chapter, with
            reviewed listings, structured offers and private deal rooms that keep every
            conversation moving forward.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="bg-emerald-500 text-navy-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
              size="lg"
            >
              <Link to="/marketplace">
                Browse businesses for sale
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </Button>
            <Button
              asChild
              className="border-white/20 bg-white/[0.04] text-white hover:border-white/40 hover:bg-white/10"
              size="lg"
              variant="outline"
            >
              <Link to="/sellers">
                Sell your business
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </Button>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
            {proofPoints.map(point => (
              <li className="flex items-center gap-2" key={point}>
                <BadgeCheck aria-hidden="true" className="text-emerald-500" size={16} />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="animate-fade-up relative mx-auto w-full max-w-[32rem] [animation-delay:120ms] lg:mr-0">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl shadow-black/40">
        <img
          alt="Two executives reviewing acquisition documents together in a glass-walled boardroom"
          className="aspect-[4/5] w-full object-cover"
          fetchPriority="high"
          height={1152}
          src="/images/landing/hero-meeting.webp"
          width={928}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/0 to-transparent"
        />
      </div>

      <div
        aria-hidden="true"
        className="animate-float absolute -left-4 top-10 hidden w-60 rounded-2xl border border-white/60 bg-white/95 p-4 text-navy-950 shadow-card backdrop-blur sm:block lg:-left-12"
      >
        <div className="flex items-center justify-between">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Offer received
          </p>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
            Example
          </span>
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight">$2.4M</p>
        <p className="text-xs text-ink-soft">B2B SaaS · Counteroffer pending</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
          <div className="h-full w-2/3 rounded-full bg-emerald-500" />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="animate-float absolute -right-3 bottom-24 hidden w-56 rounded-2xl border border-white/60 bg-white/95 p-4 text-navy-950 shadow-card backdrop-blur [animation-delay:1.5s] sm:block lg:-right-8"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-navy-950 text-white">
            <MessagesSquare size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold">Deal room</p>
            <p className="text-xs text-ink-soft">Buyer &amp; seller only</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-xs text-ink-soft">
          <FileText className="text-emerald-800" size={14} />
          financials-2025.pdf shared
        </div>
      </div>

      <p className="absolute bottom-5 left-5 right-5 text-xs text-white/70">
        Illustrative interface. Figures shown are examples only.
      </p>
    </div>
  );
}
