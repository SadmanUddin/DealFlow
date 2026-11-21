import { CheckCircle2, GitCompareArrows, Layers3, ShieldCheck } from 'lucide-react';
import { Reveal } from './Reveal';

const reasons = [
  {
    icon: ShieldCheck,
    title: 'Quality before quantity',
    description: 'Every listing is reviewed by a moderator before it is published, so buyers spend time on real opportunities.',
  },
  {
    icon: GitCompareArrows,
    title: 'Negotiation with structure',
    description: 'Offers and counteroffers are tracked as a single timeline, so both sides always see the current terms.',
  },
  {
    icon: Layers3,
    title: 'Everything in one place',
    description: 'Inquiries, conversations, documents and deal status stay connected instead of scattered across inboxes.',
  },
];

export function WhyDealFlowSection() {
  return (
    <section className="section-space scroll-mt-20 overflow-hidden" id="benefits">
      <div className="page-container grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal className="relative order-2 lg:order-1">
          <div className="grid grid-cols-[1.15fr_0.85fr] gap-4">
            <div className="overflow-hidden rounded-[1.5rem] shadow-card">
              <img
                alt="Advisor reviewing business financials on a laptop in a modern office"
                className="h-full min-h-[22rem] w-full object-cover transition duration-700 hover:scale-[1.03]"
                height={848}
                loading="lazy"
                src="/images/landing/advisor-review.webp"
                width={1264}
              />
            </div>
            <div className="flex flex-col gap-4 pt-12">
              <div className="overflow-hidden rounded-[1.5rem] shadow-card">
                <img
                  alt="Business owner standing in her workshop"
                  className="aspect-[4/5] w-full object-cover transition duration-700 hover:scale-[1.03]"
                  height={1152}
                  loading="lazy"
                  src="/images/landing/founder-portrait.webp"
                  width={928}
                />
              </div>
              <div className="rounded-2xl bg-navy-950 p-5 text-white">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-500">
                  Built for owners
                </p>
                <p className="mt-2 text-sm leading-6 text-white/75">
                  You decide which buyers to engage and what they see, and when.
                </p>
              </div>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-10 -left-10 -z-10 size-64 rounded-full bg-emerald-500/10 blur-3xl"
          />
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <p className="eyebrow text-emerald-800">Why DealFlow</p>
            <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.04em] text-navy-950 sm:text-[2.6rem] sm:leading-[1.1]">
              Built for the way acquisitions actually happen.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-ink-soft">
              Selling a company is rarely a single transaction. It is months of careful
              conversations. DealFlow gives those conversations a home.
            </p>
          </Reveal>

          <ul className="mt-10 grid gap-3">
            {reasons.map((reason, index) => {
              const Icon = reason.icon;
              return (
                <Reveal as="li" delay={index * 90} key={reason.title}>
                  <div className="group flex gap-4 rounded-2xl border border-transparent p-4 transition duration-300 hover:border-line hover:bg-white hover:shadow-soft">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-500 group-hover:text-navy-950">
                      <Icon aria-hidden="true" size={19} />
                    </span>
                    <div>
                      <h3 className="font-semibold tracking-tight text-navy-950">{reason.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink-soft">{reason.description}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={200}>
            <p className="mt-6 flex items-center gap-2 px-4 text-sm font-medium text-navy-950">
              <CheckCircle2 aria-hidden="true" className="text-emerald-600" size={16} />
              Browse the marketplace without creating an account
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
