import { ClipboardCheck, History, LockKeyhole, MailCheck, ShieldCheck, UserCog } from 'lucide-react';
import { Reveal } from './Reveal';

const safeguards = [
  {
    icon: ClipboardCheck,
    title: 'Moderated listings',
    description: 'Listings are reviewed by the DealFlow team before they appear in the marketplace.',
  },
  {
    icon: MailCheck,
    title: 'Verified accounts',
    description: 'Email verification is required, so every buyer and seller is tied to a real address.',
  },
  {
    icon: LockKeyhole,
    title: 'Participant-only deal rooms',
    description: 'Conversations and documents in a deal are visible only to the buyer and seller involved.',
  },
  {
    icon: UserCog,
    title: 'Role-based access',
    description: 'Buyer, seller and admin workspaces are separated, each seeing only what its role allows.',
  },
  {
    icon: History,
    title: 'Audit trail',
    description: 'Administrative actions are logged, giving the platform an accountable record of changes.',
  },
  {
    icon: ShieldCheck,
    title: 'Reporting & review',
    description: 'Members can report concerns, and reports are reviewed through a dedicated moderation queue.',
  },
];

export function TrustSection() {
  return (
    <section
      aria-labelledby="trust-title"
      className="relative isolate scroll-mt-20 overflow-hidden bg-navy-950 py-20 text-white sm:py-28"
      id="trust"
    >
      <div aria-hidden="true" className="hero-lines absolute inset-0 -z-10 opacity-40" />
      <div className="page-container grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal className="flex flex-col">
          <p className="eyebrow text-emerald-500">Trust, privacy &amp; security</p>
          <h2
            className="mt-3 max-w-md text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-[2.6rem] sm:leading-[1.1]"
            id="trust-title"
          >
            Confidential by default. Accountable by design.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">
            Sensitive deal information deserves more than an inbox thread. DealFlow keeps it
            inside spaces that only the right people can open.
          </p>

          <div className="relative mt-10 overflow-hidden rounded-[1.5rem] border border-white/10">
            <img
              alt="Buyer and seller shaking hands across a meeting table after agreeing terms"
              className="aspect-[3/2] w-full object-cover"
              height={848}
              loading="lazy"
              src="/images/landing/deal-handshake.webp"
              width={1264}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-tr from-navy-950/60 to-transparent"
            />
          </div>
        </Reveal>

        <ul className="grid content-start gap-4 sm:grid-cols-2">
          {safeguards.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal as="li" delay={index * 70} key={item.title}>
                <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:border-emerald-500/40 hover:bg-white/[0.07]">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 transition group-hover:bg-emerald-500 group-hover:text-navy-950">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <h3 className="mt-5 font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{item.description}</p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
