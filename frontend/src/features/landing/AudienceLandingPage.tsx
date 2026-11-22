import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

type AudienceLandingPageProps = {
  audience: 'buyers' | 'sellers';
};

const content = {
  buyers: {
    eyebrow: 'For buyers',
    title: 'Find the right business. Keep the process moving.',
    description:
      'Explore reviewed opportunities, contact owners directly, and keep offers and deal documents together as a conversation develops.',
    primary: { label: 'Browse businesses', to: '/marketplace' },
    secondary: { label: 'Create a buyer account', to: '/register?role=buyer' },
    steps: [
      ['Explore opportunities', 'Search published listings by business, industry, location, and financial range.'],
      ['Start a conversation', 'Ask the seller questions from the listing and continue in your inbox.'],
      ['Negotiate with context', 'Submit offers and follow deal activity, status, and participant-only documents.'],
    ],
  },
  sellers: {
    eyebrow: 'For sellers',
    title: 'Present your business clearly and manage buyer interest in one place.',
    description:
      'Prepare a listing for review, respond to buyer inquiries, and keep negotiations and deal documents connected as you move forward.',
    primary: { label: 'Create a seller account', to: '/register?role=seller' },
    secondary: { label: 'See current listings', to: '/marketplace' },
    steps: [
      ['Prepare your listing', 'Add your business profile and financial details, then submit it for moderation.'],
      ['Manage buyer conversations', 'Review inquiries, reply to buyers, and keep each discussion linked to its listing.'],
      ['Review offers and progress', 'Respond to offers and share eligible documents within the private deal workflow.'],
    ],
  },
} as const;

export function AudienceLandingPage({ audience }: AudienceLandingPageProps) {
  const page = content[audience];

  return (
    <main>
      <section className="bg-navy-950 py-16 text-white sm:py-24">
        <div className="page-container grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="eyebrow text-emerald-500">{page.eyebrow}</p>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
              {page.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="bg-emerald-500 text-navy-950 hover:bg-emerald-400"
                size="lg"
              >
                <Link to={page.primary.to}>
                  {page.primary.label}
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/[0.04] text-white hover:bg-white/10">
                <Link to={page.secondary.to}>{page.secondary.label}</Link>
              </Button>
            </div>
          </div>
          <aside className="rounded-2xl border border-white/12 bg-white/[0.05] p-6 sm:p-7">
            <ShieldCheck aria-hidden="true" className="text-emerald-500" size={24} />
            <h2 className="mt-4 text-lg font-semibold">A clear, accountable process</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              DealFlow reviews listings before publication and limits deal conversations and documents to their participants.
            </p>
          </aside>
        </div>
      </section>

      <section aria-label={`${audience} workflow`} className="section-space">
        <div className="page-container">
          <p className="eyebrow text-emerald-800">How DealFlow works</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.04em] text-navy-950 sm:text-4xl">
            Every next step stays connected.
          </h2>
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {page.steps.map(([title, description], index) => (
              <li className="rounded-2xl border border-line bg-white p-6 shadow-soft" key={title}>
                <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-semibold text-navy-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
              </li>
            ))}
          </ol>
          <p className="mt-7 flex items-center gap-2 text-sm text-ink-soft">
            <CheckCircle2 aria-hidden="true" className="text-emerald-700" size={16} />
            Account access is protected by email verification and role-based permissions.
          </p>
        </div>
      </section>
    </main>
  );
}
