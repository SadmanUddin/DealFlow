import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  const [keyword, setKeyword] = useState("");
  const navigate = useNavigate();

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = keyword.trim();
    navigate(
      query
        ? `/marketplace?${new URLSearchParams({ q: query })}`
        : "/marketplace",
    );
  }

  return (
    <section className="bg-forest text-white">
      <div className="page-container grid gap-9 py-10 sm:gap-12 sm:py-14 lg:grid-cols-[1fr_1.07fr] lg:items-center lg:py-16">
        <div className="min-w-0">
          <p className="eyebrow text-champagne">
            Business acquisition marketplace
          </p>
          <h1 className="editorial-title mt-6 text-[clamp(2.7rem,5.8vw,5.6rem)]">
            Find a business{" "}
            <span className="block text-[#e0ebd4]">worth owning.</span>
          </h1>
          <p className="mt-5 max-w-[38ch] text-base leading-7 text-[#deebe2] sm:text-lg">
            Explore businesses for sale, speak directly with owners, and manage
            your acquisition from the first conversation to closing.
          </p>
          <form
            className="mt-7 flex max-w-lg flex-col gap-2 rounded-2xl border border-white/20 bg-white p-2 sm:flex-row"
            role="search"
            aria-label="Find a business"
            onSubmit={search}
          >
            <label className="flex min-w-0 flex-1 items-center gap-3 px-2 text-ink-soft">
              <Search size={19} aria-hidden="true" />
              <span className="sr-only">Business keyword</span>
              <input
                className="min-w-0 flex-1 rounded-lg bg-white px-2 py-2.5 text-base text-ink"
                placeholder="Search businesses"
                maxLength={120}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <Button type="submit" variant="accent">
              Explore businesses
            </Button>
          </form>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10"
            to="/sellers"
          >
            Sell your business
          </Link>
        </div>
        <figure className="min-w-0">
          <img
            alt="Two people talking over coffee at a table in a modern café"
            className="aspect-[5/4] w-full rounded-[1.45rem] object-cover object-center sm:aspect-[6/4] lg:aspect-[4/3]"
            width="1440"
            height="810"
            src="/images/editorial/transaction.webp"
            srcSet="/images/editorial/transaction-small.webp 720w, /images/editorial/transaction.webp 1440w"
            sizes="(min-width: 1280px) 620px, (min-width: 1024px) 49vw, 94vw"
            fetchPriority="high"
          />
        </figure>
      </div>
    </section>
  );
}
