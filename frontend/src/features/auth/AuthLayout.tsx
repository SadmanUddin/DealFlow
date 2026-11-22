import type { ReactNode } from "react";
import { Building2, KeyRound, Search } from "lucide-react";
import { Link } from "react-router";

const visuals = {
  login: {
    image: "account.webp",
    alt: "Barista setting an espresso on a café counter",
    width: 1100,
    height: 733,
    title: "Pick up where you left off.",
    description: "Return to your conversations, offers, and deals.",
    Icon: KeyRound,
  },
  buyer: {
    image: "buyers.webp",
    alt: "Two people reviewing notes and working side by side",
    width: 1000,
    height: 667,
    title: "Find a business worth building.",
    description:
      "Save opportunities, speak with owners, and manage your acquisition in one place.",
    Icon: Search,
  },
  seller: {
    image: "sellers.webp",
    alt: "Café worker behind the counter of a neighborhood shop",
    width: 1000,
    height: 667,
    title: "Find the next owner for your business.",
    description:
      "Create your listing, respond to buyers, and keep track of negotiations.",
    Icon: Building2,
  },
  recovery: {
    image: "account.webp",
    alt: "Barista setting an espresso on a café counter",
    width: 1100,
    height: 733,
    title: "Get back to your account.",
    description: "Your conversations and deals will be there when you return.",
    Icon: KeyRound,
  },
  verification: {
    image: "account.webp",
    alt: "Barista setting an espresso on a café counter",
    width: 1100,
    height: 733,
    title: "Confirm your email to get started.",
    description:
      "Once your address is verified, you can sign in and use your workspace.",
    Icon: KeyRound,
  },
};

export function AuthLayout({
  children,
  variant = "login",
}: {
  children: ReactNode;
  variant?: keyof typeof visuals;
}) {
  const { image, alt, title, description, Icon, width, height } =
    visuals[variant];

  return (
    <main className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(480px,0.95fr)_minmax(0,1.05fr)]">
      <div className="flex min-w-0 flex-col px-5 pb-10 pt-6 sm:px-10 sm:pb-14 sm:pt-8 lg:min-h-dvh lg:px-12">
        <nav
          aria-label="Page navigation"
          className="mx-auto flex w-full max-w-md items-center justify-between gap-3 lg:max-w-none"
        >
          <Link
            aria-label="DealFlow home"
            className="inline-flex items-center gap-2 rounded-lg text-xl font-semibold tracking-[-0.055em] text-navy-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800"
            to="/"
          >
            <img
              alt=""
              className="size-9 rounded-lg object-cover"
              height="36"
              src="/brand/dealflow-symbol-recraft.png"
              srcSet="/brand/dealflow-symbol-recraft-96.png 96w, /brand/dealflow-symbol-recraft.png 1024w"
              sizes="40px"
              width="36"
            />
            DealFlow
          </Link>
          <Link
            className="max-sm:text-xs text-right text-sm font-medium text-ink-soft underline-offset-4 hover:text-emerald-900 hover:underline"
            to="/marketplace"
          >
            Browse marketplace
          </Link>
        </nav>
        <div className="mx-auto my-auto w-full max-w-md pt-12 sm:pt-16 lg:py-16">
          {children}
        </div>
      </div>
      <aside className="hidden min-w-0 p-4 pl-0 lg:block">
        <div className="sticky top-4 isolate flex min-h-[calc(100dvh-2rem)] items-end overflow-hidden rounded-[2rem] bg-[#142b27] p-10 xl:p-14">
          <img
            alt={alt}
            className="absolute inset-0 -z-20 size-full object-cover object-center"
            height={height}
            loading="lazy"
            decoding="async"
            src={`/images/editorial/${image}`}
            width={width}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-t from-[#102522] via-[#102522]/55 to-transparent"
          />
          <div className="max-w-md text-white">
            <span className="mb-5 inline-grid size-11 place-items-center rounded-full border border-white/35 bg-[#102522]/65">
              <Icon aria-hidden="true" size={20} />
            </span>
            <p className="font-display text-5xl leading-[1.02] tracking-[-0.035em] xl:text-6xl">
              {title}
            </p>
            <p className="mt-5 max-w-sm text-base leading-7 text-white/90">
              {description}
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
