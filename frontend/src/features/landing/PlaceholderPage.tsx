import { ArrowLeft, ArrowUpRight, Compass } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function PlaceholderPage({
  audience,
}: {
  audience: "buyers" | "sellers";
}) {
  const buyer = audience === "buyers";

  return (
    <section className="page-container grid min-h-[65vh] place-items-center py-16">
      <div className="max-w-xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
          <Compass aria-hidden="true" size={23} />
        </span>
        <p className="eyebrow mt-6 text-emerald-800">
          A future DealFlow experience
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-navy-950 sm:text-4xl">
          {buyer ? "For buyers" : "For sellers"}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-ink-soft">
          {buyer
            ? "The buyer experience will make it easier to explore opportunities and start thoughtful conversations."
            : "The seller experience will help owners share their business and manage conversations with interested buyers."}
        </p>
        <p className="mt-3 text-sm text-ink-faint">
          This preview is informational. No account or marketplace action is
          available yet.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/">
              <ArrowLeft aria-hidden="true" size={15} />
              Back to DealFlow
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href="/#how-it-works">
              How it works <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
