import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <section className="page-container grid min-h-[65vh] place-items-center py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-emerald-800">
          404
        </p>
        <h1 className="mt-3 editorial-title text-5xl text-navy-950">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Check the address or browse the marketplace to find what you were
          looking for.
        </p>
        <Button asChild className="mt-6">
          <Link to="/marketplace">Browse the marketplace</Link>
        </Button>
      </div>
    </section>
  );
}
