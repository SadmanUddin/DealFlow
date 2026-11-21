import { FileSignature, Handshake, MessagesSquare, Search, type LucideIcon } from 'lucide-react';
import { Reveal } from './Reveal';

type Step = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
  buyer: string;
  seller: string;
};

const steps: Step[] = [
  {
    number: '01',
    icon: Search,
    title: 'Discover',
    description: 'Sellers publish a listing that is reviewed before it goes live. Buyers browse and save opportunities that fit.',
    buyer: 'Browse and save listings',
    seller: 'Publish a reviewed listing',
  },
  {
    number: '02',
    icon: MessagesSquare,
    title: 'Connect',
    description: 'Buyers send an inquiry. Sellers decide who to engage with and the conversation moves into a private space.',
    buyer: 'Send an inquiry',
    seller: 'Choose who to engage',
  },
  {
    number: '03',
    icon: FileSignature,
    title: 'Negotiate',
    description: 'Structured offers and counteroffers keep terms clear, with every revision captured in a shared timeline.',
    buyer: 'Submit an offer',
    seller: 'Accept or counter',
  },
  {
    number: '04',
    icon: Handshake,
    title: 'Progress the deal',
    description: 'Share documents and coordinate next steps in a deal room visible only to its participants.',
    buyer: 'Review shared documents',
    seller: 'Share what matters',
  },
];

export function HowItWorksSection() {
  return (
    <section className="section-space scroll-mt-20 bg-white" id="how-it-works">
      <div className="page-container">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
          <Reveal>
            <p className="eyebrow text-emerald-800">How DealFlow works</p>
            <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.04em] text-navy-950 sm:text-[2.6rem] sm:leading-[1.1]">
              One clear path from first look to closing table.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="max-w-lg text-base leading-7 text-ink-soft lg:justify-self-end">
              Buyers and sellers move through the same four stages, each with the tools the
              platform provides for that moment and nothing that gets in the way.
            </p>
          </Reveal>
        </div>

        <ol className="relative mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-[2.75rem] hidden h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0 lg:block"
          />
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal as="li" delay={index * 90} key={step.number}>
                <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-paper p-6 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:bg-white hover:shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="relative grid size-11 place-items-center rounded-xl bg-navy-950 text-white transition duration-300 group-hover:bg-emerald-500 group-hover:text-navy-950">
                      <Icon aria-hidden="true" size={19} />
                    </span>
                    <span className="font-mono text-xs font-medium tracking-wider text-ink-faint">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="mt-7 text-lg font-semibold tracking-tight text-navy-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-ink-soft">{step.description}</p>
                  <dl className="mt-6 grid gap-2 border-t border-line pt-4 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="font-semibold uppercase tracking-[0.1em] text-ink-faint">Buyer</dt>
                      <dd className="text-right font-medium text-navy-950">{step.buyer}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="font-semibold uppercase tracking-[0.1em] text-ink-faint">Seller</dt>
                      <dd className="text-right font-medium text-navy-950">{step.seller}</dd>
                    </div>
                  </dl>
                </article>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
