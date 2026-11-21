import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Compass,
  Handshake,
  Layers3,
  LockKeyhole,
  MessagesSquare,
  MoveRight,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const steps = [
  {
    number: '01',
    icon: Compass,
    title: 'Find the right fit',
    description:
      'Explore businesses with the context to understand what makes each opportunity distinct.',
  },
  {
    number: '02',
    icon: MessagesSquare,
    title: 'Start a considered conversation',
    description:
      'Bring buyers and sellers together in one private space to ask better questions.',
  },
  {
    number: '03',
    icon: Handshake,
    title: 'Move forward with clarity',
    description:
      'Keep the important details, next steps, and shared decisions organized as you go.',
  },
];

const benefits = [
  {
    icon: BadgeCheck,
    title: 'Built around trust',
    description:
      'A focused environment for serious conversations, with room for both sides to make informed decisions.',
  },
  {
    icon: Layers3,
    title: 'The details stay together',
    description:
      'Keep opportunity discovery, conversations, and deal documents connected as discussions progress.',
  },
  {
    icon: LockKeyhole,
    title: 'Private by design',
    description:
      'Sensitive discussions and shared documents belong in participant-only spaces.',
  },
];

function DealFlowIllustration() {
  return (
    <div
      aria-label="Illustration of a buyer and seller moving through a clear deal process"
      className="relative mx-auto w-full max-w-[34rem]"
      role="img"
    >
      <div className="absolute -inset-5 rounded-[2.5rem] bg-emerald-900/[0.035] blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-card backdrop-blur sm:p-7">
        <div className="flex items-center justify-between border-b border-line pb-5">
          <div>
            <p className="eyebrow text-ink-faint">A clearer way forward</p>
            <p className="mt-1.5 text-sm font-semibold tracking-tight text-ink">
              From first look to next steps
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
            <Sparkles aria-hidden="true" size={18} />
          </span>
        </div>

        <div className="relative grid grid-cols-3 gap-2 py-8 sm:gap-4">
          <div className="absolute left-[15%] right-[15%] top-[3.15rem] h-px bg-emerald-200" />
          {[
            { label: 'Discover', icon: Compass },
            { label: 'Connect', icon: MessagesSquare },
            { label: 'Progress', icon: MoveRight },
          ].map((step, index) => {
            const Icon = step.icon;
            return (
              <div className="relative flex flex-col items-center text-center" key={step.label}>
                <span
                  className={`grid size-12 place-items-center rounded-2xl border shadow-sm ${
                    index === 1
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-emerald-100 bg-white text-emerald-800'
                  }`}
                >
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span className="mt-3 text-xs font-semibold text-ink sm:text-sm">
                  {step.label}
                </span>
                <span className="mt-1 text-[0.65rem] text-ink-faint sm:text-xs">
                  Step 0{index + 1}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-mist p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-[0.7rem] font-semibold text-white">
                DF
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">A conversation with direction</p>
                <p className="mt-0.5 text-xs text-ink-faint">A shared space for the next step</p>
              </div>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[0.68rem] font-medium text-emerald-900 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Thoughtful progress
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-soft">
            <span className="grid size-6 place-items-center rounded-full bg-white text-emerald-800">
              <ArrowRight aria-hidden="true" size={12} />
            </span>
            Clear context. Better conversations.
          </div>
        </div>
        <div className="absolute -right-3 top-[39%] hidden rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-card lg:block">
          <p className="text-[0.63rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Buyer ↔ Seller
          </p>
          <p className="mt-1 text-xs font-medium text-ink">One shared journey</p>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-3 shadow-card sm:flex">
        <span className="grid size-8 place-items-center rounded-lg bg-navy-50 text-navy-800">
          <LockKeyhole aria-hidden="true" size={15} />
        </span>
        <span className="text-xs font-medium text-ink-soft">Private by design</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <>
      <section className="hero-grid relative overflow-hidden">
        <div className="page-container grid min-h-[40rem] items-center gap-14 py-16 md:min-h-[44rem] md:grid-cols-[1.03fr_0.97fr] md:py-20 lg:gap-10">
          <div className="relative z-10 max-w-[38rem]">
            <Badge>
              <span className="size-1.5 rounded-full bg-emerald-600" />
              A marketplace for what comes next
            </Badge>
            <h1 className="mt-7 text-balance text-[clamp(2.7rem,6vw,5.2rem)] font-semibold leading-[0.99] tracking-[-0.065em] text-navy-950">
              Make your next move{' '}
              <span className="font-serif italic font-normal tracking-[-0.055em] text-emerald-800">
                a confident one.
              </span>
            </h1>
            <p className="mt-6 max-w-[33rem] text-pretty text-base leading-7 text-ink-soft sm:text-lg sm:leading-8">
              DealFlow brings business buyers and sellers together with the
              context, privacy, and structure to move a meaningful transition
              forward.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/marketplace">
                  I’m looking to buy
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/sellers">
                  I’m considering a sale
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </Button>
            </div>
            <a
              className="mt-10 inline-flex items-center gap-2 text-xs font-medium text-ink-faint transition hover:text-ink"
              href="#how-it-works"
            >
              A more considered process
              <ArrowDown aria-hidden="true" size={13} />
            </a>
          </div>
          <div className="relative z-10 px-1 py-4 sm:px-6 md:px-0 md:py-12">
            <DealFlowIllustration />
          </div>
        </div>
        <div className="absolute -right-48 top-10 size-[35rem] rounded-full border border-emerald-900/[0.045]" />
        <div className="absolute -right-24 top-36 size-[25rem] rounded-full border border-emerald-900/[0.05]" />
      </section>

      <section className="border-y border-line bg-white">
        <div className="page-container grid gap-4 py-7 sm:grid-cols-3 sm:gap-8">
          {[
            ['For buyers', 'Explore with intention'],
            ['For sellers', 'Share your next chapter'],
            ['For both sides', 'Keep the process in view'],
          ].map(([eyebrow, line]) => (
            <div className="flex items-center gap-3" key={eyebrow}>
              <span className="size-1.5 rounded-full bg-emerald-600" />
              <div>
                <p className="text-[0.67rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  {eyebrow}
                </p>
                <p className="mt-0.5 text-sm font-medium text-ink">{line}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-space" id="how-it-works">
        <div className="page-container">
          <div className="section-heading">
            <p className="eyebrow text-emerald-800">A clear path forward</p>
            <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.045em] text-navy-950 sm:text-4xl">
              A big decision deserves a better process.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">
              Business transitions take care, time, and good communication.
              DealFlow gives both sides a focused place to take the next step.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map(step => {
              const Icon = step.icon;
              return (
                <Card className="group border-transparent bg-white transition duration-300 hover:-translate-y-1 hover:border-line hover:shadow-card" key={step.number}>
                  <CardContent className="relative min-h-[15.5rem] p-6 sm:p-7">
                    <div className="flex items-start justify-between">
                      <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-700 group-hover:text-white">
                        <Icon aria-hidden="true" size={19} />
                      </span>
                      <span className="font-mono text-xs tracking-wider text-ink-faint">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-semibold tracking-tight text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink-soft">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-navy-950 py-20 text-white sm:py-24" id="benefits">
        <div className="page-container">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="eyebrow text-emerald-300">Made for meaningful moves</p>
              <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
                The right details. The right people. A little more clarity.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-white/65 lg:justify-self-end">
              Buying or selling a business is more than a transaction. DealFlow
              is designed to bring structure to the conversations that shape
              what happens next.
            </p>
          </div>

          <div className="mt-12 grid gap-3 md:grid-cols-3">
            {benefits.map(benefit => {
              const Icon = benefit.icon;
              return (
                <div
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 transition hover:border-emerald-300/30 hover:bg-white/[0.07] sm:p-7"
                  key={benefit.title}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <h3 className="mt-6 font-semibold tracking-tight text-white">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-space">
        <div className="page-container">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-emerald-800 px-6 py-12 text-white sm:px-10 sm:py-14 lg:px-14">
            <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <p className="eyebrow text-emerald-100/75">Your next chapter starts with a conversation</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                  Take the first step when you’re ready.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
                  Explore what DealFlow is being built to make possible for
                  buyers and sellers.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Button asChild className="bg-white text-emerald-900 hover:bg-emerald-50" size="lg">
                  <Link to="/marketplace">
                    For buyers <ArrowUpRight aria-hidden="true" size={16} />
                  </Link>
                </Button>
                <Button asChild className="border-white/30 bg-transparent text-white hover:bg-white/10" size="lg" variant="outline">
                  <Link to="/sellers">For sellers</Link>
                </Button>
              </div>
            </div>
            <div className="absolute -right-14 -top-32 size-80 rounded-full border border-white/10" />
            <div className="absolute -right-2 -top-20 size-56 rounded-full border border-white/10" />
          </div>
        </div>
      </section>
    </>
  );
}
