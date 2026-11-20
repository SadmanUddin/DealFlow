import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <section className="page-container grid min-h-[65vh] place-items-center py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-emerald-800">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-navy-950">
          This page isn’t here.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          The page may have moved, or the address may be mistyped.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" size={15} />
            Return home
          </Link>
        </Button>
      </div>
    </section>
  );
}
