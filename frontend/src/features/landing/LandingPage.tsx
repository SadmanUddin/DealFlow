import {
  Building2,
  CircleCheck,
  Files,
  Handshake,
  LockKeyhole,
  MessagesSquare,
  Search,
  Tag,
} from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { HeroSection } from "./sections/HeroSection";
import { PromotedListings } from "./sections/PromotedListings";

const paths = [
  {
    heading: "Buy a business",
    summary:
      "Compare asking prices and financials, put your questions to the seller, and keep track of each offer as you decide.",
    path: "/buyers",
    label: "Explore the buyer process",
    image: "buyers",
    alt: "Two people comparing notes at a café table",
  },
  {
    heading: "Sell a business",
    summary:
      "Present the business you’ve built, answer inquiries, and review offers without losing track of the conversation behind each one.",
    path: "/sellers",
    label: "Explore the seller process",
    image: "sellers",
    alt: "A barista working behind an independent coffee shop counter",
  },
];

const steps = [
  {
    icon: Search,
    title: "Discover or list",
    text: "Search by industry, location, or financial range, or prepare a listing for review.",
  },
  {
    icon: MessagesSquare,
    title: "Connect",
    text: "Open an inquiry directly from a listing and keep messages with the business.",
  },
  {
    icon: Building2,
    title: "Discuss",
    text: "Ask questions about the business and decide whether to move forward.",
  },
  {
    icon: Tag,
    title: "Negotiate",
    text: "Exchange offers and counteroffers with a record of each proposal.",
  },
  {
    icon: Files,
    title: "Manage the deal",
    text: "Track progress and share documents in the private deal room.",
  },
  {
    icon: CircleCheck,
    title: "Confirm completion",
    text: "Agree on a final amount and confirm after the acquisition closes.",
  },
];

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <PromotedListings />
      <section className="section-space bg-white" aria-labelledby="journeys">
        <div className="page-container">
          <h2
            id="journeys"
            className="editorial-title mb-8 text-4xl sm:text-6xl"
          >
            Choose your next step
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            {paths.map((path) => (
              <article
                key={path.path}
                className="overflow-hidden rounded-2xl border border-line bg-ivory"
              >
                <img
                  className="aspect-[2/1] w-full object-cover"
                  src={`/images/editorial/${path.image}.webp`}
                  alt={path.alt}
                  width="1000"
                  height="666"
                  loading="lazy"
                  decoding="async"
                />
                <div className="p-5 sm:p-8">
                  <h3 className="font-display text-3xl font-medium">
                    {path.heading}
                  </h3>
                  <p className="mt-2 max-w-[48ch] text-base leading-7 text-ink-soft">
                    {path.summary}
                  </p>
                  <Button asChild variant="outline" className="mt-5">
                    <Link to={path.path}>{path.label}</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="how-it-works"
        className="section-space border-y border-line bg-ivory"
        aria-labelledby="process-heading"
      >
        <div className="page-container">
          <h2
            id="process-heading"
            className="editorial-title max-w-xl text-4xl sm:text-6xl"
          >
            From first look to closing
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }) => (
              <li key={title} className="bg-white p-5 sm:p-7">
                <div className="grid size-10 place-items-center rounded-lg bg-mist text-forest">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <PromotedListings sold />
      <section
        id="benefits"
        className="section-space bg-white"
        aria-labelledby="private-heading"
      >
        <div className="page-container grid items-start gap-8 lg:grid-cols-[1fr_1.05fr]">
          <h2
            id="private-heading"
            className="editorial-title max-w-[15ch] text-4xl sm:text-6xl"
          >
            A public listing. A private deal.
          </h2>
          <div className="divide-y divide-line border-y border-line">
            <div className="flex gap-4 py-5">
              <LockKeyhole
                className="mt-1 shrink-0 text-forest"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-semibold">
                  Keep sensitive documents in the deal room
                </h3>
                <p className="mt-2 text-base leading-7 text-ink-soft">
                  Only the participants can access the private documents shared
                  in their deal.
                </p>
              </div>
            </div>
            <div className="flex gap-4 py-5">
              <Handshake
                className="mt-1 shrink-0 text-forest"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-semibold">
                  Decide together what to disclose
                </h3>
                <p className="mt-2 text-base leading-7 text-ink-soft">
                  A business is marked sold once both parties confirm
                  completion. The final price is public only with both parties’
                  permission.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        className="bg-forest py-12 text-white sm:py-17"
        aria-labelledby="next-step-heading"
      >
        <div className="page-container flex flex-wrap items-center justify-between gap-6">
          <h2
            id="next-step-heading"
            className="editorial-title max-w-xl text-4xl sm:text-6xl"
          >
            Ready to take the next step?
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-white text-forest hover:bg-mist">
              <Link to="/marketplace">Explore businesses</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <Link to="/register?role=seller">Create a seller account</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
