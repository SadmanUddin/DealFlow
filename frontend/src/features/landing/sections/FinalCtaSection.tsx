import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Reveal } from './Reveal';

export function FinalCtaSection() {
  return (
    <section aria-labelledby="final-cta-title" className="section-space">
      <div className="page-container">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-navy-950 px-6 py-16 text-white sm:px-12 sm:py-20 lg:px-16">
            <img
              alt=""
              className="absolute inset-0 -z-20 size-full object-cover opacity-25"
              height={1152}
              loading="lazy"
              src="/images/landing/hero-meeting.webp"
              width={928}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950 via-navy-950/90 to-navy-950/40"
            />
            <div className="max-w-2xl">
              <p className="eyebrow text-emerald-500">Your next chapter</p>
              <h2
                className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl sm:leading-[1.05]"
                id="final-cta-title"
              >
                The right deal starts with the right conversation.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
                Create a free account to save listings, contact sellers, or publish your own
                business for review.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="bg-emerald-500 text-navy-950 hover:bg-emerald-400"
                  size="lg"
                >
                  <Link to="/register">
                    Create your account
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="border-white/20 bg-white/[0.04] text-white hover:border-white/40 hover:bg-white/10"
                  size="lg"
                  variant="outline"
                >
                  <Link to="/marketplace">
                    Browse the marketplace
                    <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
