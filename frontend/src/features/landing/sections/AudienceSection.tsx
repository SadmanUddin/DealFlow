import { ArrowRight, Briefcase, Check, Store } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

const audiences = [
  {
    key: 'buyers',
    icon: Briefcase,
    eyebrow: 'For buyers',
    title: 'Find a business worth building on.',
    benefits: [
      'Browse moderated listings with key financials up front',
      'Save opportunities and get notified as they progress',
      'Send inquiries and structured offers in one place',
      'Track every active deal from your buyer workspace',
    ],
    cta: { label: 'Explore the marketplace', to: '/marketplace' },
    secondary: { label: 'How buying works', to: '/buyers' },
    dark: false,
  },
  {
    key: 'sellers',
    icon: Store,
    eyebrow: 'For sellers',
    title: 'Sell on your terms, to the right buyer.',
    benefits: [
      'Create a listing that is reviewed before it goes live',
      'Choose which inquiries to engage with',
      'Compare offers and send counteroffers with clarity',
      'Share documents only inside private deal rooms',
    ],
    cta: { label: 'List your business', to: '/register' },
    secondary: { label: 'How selling works', to: '/sellers' },
    dark: true,
  },
];

export function AudienceSection() {
  return (
    <section aria-label="Buyer and seller benefits" className="section-space">
      <div className="page-container grid gap-5 lg:grid-cols-2">
        {audiences.map((audience, index) => {
          const Icon = audience.icon;
          return (
            <Reveal delay={index * 100} key={audience.key}>
              <article
                className={cn(
                  'relative flex h-full flex-col overflow-hidden rounded-[1.75rem] p-8 transition duration-300 hover:-translate-y-1 sm:p-10',
                  audience.dark
                    ? 'bg-navy-950 text-white hover:shadow-2xl hover:shadow-navy-950/30'
                    : 'border border-line bg-white text-navy-950 hover:shadow-card',
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute -right-20 -top-20 size-64 rounded-full blur-3xl',
                    audience.dark ? 'bg-emerald-500/15' : 'bg-emerald-500/10',
                  )}
                />
                <span
                  className={cn(
                    'relative grid size-12 place-items-center rounded-2xl',
                    audience.dark ? 'bg-emerald-500 text-navy-950' : 'bg-navy-950 text-white',
                  )}
                >
                  <Icon aria-hidden="true" size={20} />
                </span>
                <p
                  className={cn(
                    'eyebrow relative mt-8',
                    audience.dark ? 'text-emerald-500' : 'text-emerald-800',
                  )}
                >
                  {audience.eyebrow}
                </p>
                <h2 className="relative mt-3 max-w-sm text-balance text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                  {audience.title}
                </h2>
                <ul className="relative mt-7 grid flex-1 gap-3.5">
                  {audience.benefits.map(benefit => (
                    <li className="flex items-start gap-3 text-sm leading-6" key={benefit}>
                      <span
                        className={cn(
                          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                          audience.dark
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-emerald-50 text-emerald-800',
                        )}
                      >
                        <Check aria-hidden="true" size={12} strokeWidth={3} />
                      </span>
                      <span className={audience.dark ? 'text-white/75' : 'text-ink-soft'}>
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="relative mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    asChild
                    className={
                      audience.dark
                        ? 'bg-emerald-500 text-navy-950 hover:bg-emerald-400'
                        : undefined
                    }
                  >
                    <Link to={audience.cta.to}>
                      {audience.cta.label}
                      <ArrowRight aria-hidden="true" size={16} />
                    </Link>
                  </Button>
                  <Link
                    className={cn(
                      'rounded-md px-1 text-sm font-medium underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30',
                      audience.dark ? 'text-white/75 hover:text-white' : 'text-ink-soft hover:text-navy-950',
                    )}
                    to={audience.secondary.to}
                  >
                    {audience.secondary.label}
                  </Link>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
