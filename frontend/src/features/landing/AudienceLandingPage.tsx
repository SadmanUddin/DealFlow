import {
  ChartNoAxesColumn,
  CircleCheck,
  Files,
  MessagesSquare,
  Search,
  Store,
} from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

const content = {
  buyers: {
    label: "For buyers",
    title: "Find the right business to own.",
    description:
      "Compare opportunities, ask owners the questions that matter, and keep the details of each negotiation in one place.",
    photo: "buyers",
    alt: "Two people reviewing notes and laptops over coffee",
    primary: { label: "Browse businesses", to: "/marketplace" },
    secondary: { label: "Create a buyer account", to: "/register?role=buyer" },
    steps: [
      {
        icon: Search,
        title: "Build a shortlist",
        text: "Filter by industry, location, asking price, revenue, or EBITDA. Save listings to revisit them later.",
      },
      {
        icon: MessagesSquare,
        title: "Speak with the owner",
        text: "Start a private conversation from the listing and keep each discussion with the business it concerns.",
      },
      {
        icon: Files,
        title: "Keep a record of the deal",
        text: "Submit offers and follow deal activity, from the first proposal through documents and closing confirmations.",
      },
    ],
    note: "Listing information comes from sellers. Ask for supporting records as part of your own due diligence.",
  },
  sellers: {
    label: "For sellers",
    title: "Present your business and manage buyer interest.",
    description:
      "Give prospective buyers a clear picture of the business you’ve built. Keep inquiries, offers, and deal documents organized as you move toward a sale.",
    photo: "sellers",
    alt: "A barista behind the counter of a warmly lit coffee shop",
    primary: { label: "Create a seller account", to: "/register?role=seller" },
    secondary: { label: "See current listings", to: "/marketplace" },
    steps: [
      {
        icon: Store,
        title: "Prepare your listing",
        text: "Tell buyers what the business does, add relevant financial details and a photo, then submit it for moderation.",
      },
      {
        icon: MessagesSquare,
        title: "Manage inquiries",
        text: "See who has reached out, respond privately, and keep each conversation linked to its listing.",
      },
      {
        icon: ChartNoAxesColumn,
        title: "Negotiate and close",
        text: "Review offers and counteroffers. After the acquisition closes, agree on the final amount and confirm it with the buyer.",
      },
    ],
    note: "The listing shows as sold once both parties confirm completion. The final price is public only if both parties agree to share it.",
  },
} as const;

export function AudienceLandingPage({
  audience,
}: {
  audience: keyof typeof content;
}) {
  const page = content[audience];
  return (
    <>
      <section className="bg-forest text-white">
        <div className="page-container grid gap-8 py-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:py-16">
          <div>
            <p className="eyebrow text-champagne">{page.label}</p>
            <h1 className="editorial-title mt-5 max-w-[14ch] text-[clamp(3rem,6vw,6rem)]">
              {page.title}
            </h1>
            <p className="mt-5 max-w-[38ch] text-base leading-7 text-white/85 sm:text-lg">
              {page.description}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="bg-white text-forest hover:bg-mist">
                <Link to={page.primary.to}>{page.primary.label}</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10"
              >
                <Link to={page.secondary.to}>{page.secondary.label}</Link>
              </Button>
            </div>
          </div>
          <img
            className="aspect-[4/3] w-full rounded-2xl object-cover"
            src={`/images/editorial/${page.photo}.webp`}
            alt={page.alt}
            width="1000"
            height="666"
            fetchPriority="high"
          />
        </div>
      </section>
      <section className="section-space" aria-labelledby="audience-workflow">
        <div className="page-container">
          <h2
            className="editorial-title text-4xl sm:text-6xl"
            id="audience-workflow"
          >
            {audience === "buyers"
              ? "Your path to an acquisition"
              : "From listing to sale"}
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            {page.steps.map(({ icon: Icon, title, text }) => (
              <li className="bg-white p-5 sm:p-7" key={title}>
                <span className="grid size-10 place-items-center rounded-lg bg-mist text-forest">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex gap-3 rounded-xl border border-line bg-mist p-4 text-sm leading-6 text-ink-soft">
            <CircleCheck
              className="mt-0.5 shrink-0 text-forest"
              size={19}
              aria-hidden="true"
            />
            {page.note}
          </p>
        </div>
      </section>
    </>
  );
}
