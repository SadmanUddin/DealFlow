import { ArrowRight, Info, MapPin, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Reveal } from './Reveal';

type DemoListing = {
  title: string;
  industry: string;
  location: string;
  image: string;
  imageAlt: string;
  askingPrice: string;
  revenue: string;
  profit: string;
  growth: string;
};

const demoListings: DemoListing[] = [
  {
    title: 'Vertical SaaS for independent clinics',
    industry: 'Software',
    location: 'Austin, TX',
    image: '/images/landing/listing-saas.webp',
    imageAlt: 'Bright software company workspace with analytics dashboards on laptops',
    askingPrice: '$3.2M',
    revenue: '$1.1M',
    profit: '$640K',
    growth: '+38% YoY',
  },
  {
    title: 'Specialty coffee roaster & wholesale',
    industry: 'Food & Beverage',
    location: 'Portland, OR',
    image: '/images/landing/listing-roastery.webp',
    imageAlt: 'Artisan coffee roastery with roasting machine and burlap sacks',
    askingPrice: '$1.4M',
    revenue: '$2.3M',
    profit: '$410K',
    growth: '+12% YoY',
  },
  {
    title: 'Regional 3PL & fulfilment operator',
    industry: 'Logistics',
    location: 'Columbus, OH',
    image: '/images/landing/listing-logistics.webp',
    imageAlt: 'Organized modern distribution warehouse with shelving and packed boxes',
    askingPrice: '$5.8M',
    revenue: '$7.9M',
    profit: '$1.2M',
    growth: '+21% YoY',
  },
  {
    title: 'Multi-site physiotherapy practice',
    industry: 'Healthcare',
    location: 'Denver, CO',
    image: '/images/landing/listing-clinic.webp',
    imageAlt: 'Bright modern physiotherapy clinic interior with treatment tables',
    askingPrice: '$2.6M',
    revenue: '$3.4M',
    profit: '$720K',
    growth: '+9% YoY',
  },
];

export function MarketplacePreviewSection() {
  return (
    <section aria-labelledby="marketplace-preview-title" className="section-space bg-white">
      <div className="page-container">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <p className="eyebrow text-emerald-800">Marketplace preview</p>
            <h2
              className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.04em] text-navy-950 sm:text-[2.6rem] sm:leading-[1.1]"
              id="marketplace-preview-title"
            >
              See what a DealFlow listing looks like.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <Button asChild variant="outline">
              <Link to="/marketplace">
                View live marketplace
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </Button>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <p className="mt-6 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Info aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
            <span>
              <strong className="font-semibold">Demonstration content.</strong> These listings are
              fictional examples of the format. They are not real businesses for sale.
            </span>
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {demoListings.map((listing, index) => (
            <Reveal as="li" delay={index * 80} key={listing.title}>
              <DemoListingCard listing={listing} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DemoListingCard({ listing }: { listing: DemoListing }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-card">
      <div className="relative aspect-[3/2] overflow-hidden bg-mist">
        <img
          alt={listing.imageAlt}
          className="size-full object-cover transition duration-700 group-hover:scale-105"
          height={644}
          loading="lazy"
          src={listing.image}
          width={960}
        />
        <span className="absolute left-3 top-3 rounded-full bg-navy-950/85 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
          Demo listing
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          {listing.industry}
        </p>
        <h3 className="mt-3 text-base font-semibold leading-snug tracking-tight text-navy-950">
          {listing.title}
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
          <MapPin aria-hidden="true" className="text-emerald-800" size={14} />
          {listing.location}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
          <Metric label="Asking" value={listing.askingPrice} />
          <Metric label="Revenue" value={listing.revenue} />
          <Metric label="Profit" value={listing.profit} />
        </dl>

        <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <TrendingUp aria-hidden="true" size={14} />
          {listing.growth}
        </p>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-navy-950">{value}</dd>
    </div>
  );
}
