import { ArrowUpRight, Store } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { MarketplacePreview } from "./MarketplacePreview";
import { OpportunityMap } from "./OpportunityMap";
import "./hero.css";

export function HeroSection() {
  const { hash, key } = useLocation();

  useEffect(() => {
    if (hash === "#how-it-works" || hash === "#benefits") {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView?.({ behavior: "instant" });
    }
  }, [hash, key]);

  return (
    <section className="dealflow-hero" aria-labelledby="homepage-title">
      <div className="page-container dealflow-hero-layout">
        <div className="dealflow-hero-copy">
          <h1 id="homepage-title" className="dealflow-hero-title">
            <span className="block">Your next business.</span>{" "}
            <span className="dealflow-hero-phrase block">
              <span>Your</span> <span>next</span> <span>chapter.</span>
            </span>
          </h1>
          <p className="dealflow-hero-description">
            Discover businesses worth acquiring. Connect directly with owners,
            evaluate opportunities, and manage your entire acquisition journey
            in one secure platform.
          </p>
          <div className="dealflow-hero-actions">
            <Link className="dealflow-cta" to="/marketplace">
              <span className="dealflow-cta-label">
                <span>Explore businesses</span>
                <span aria-hidden="true">Explore businesses</span>
              </span>
              <span className="dealflow-cta-icon">
                <ArrowUpRight size={19} aria-hidden="true" />
              </span>
            </Link>
            <Link className="dealflow-secondary" to="/sellers">
              <Store size={18} aria-hidden="true" />
              Sell your business
            </Link>
          </div>
        </div>
        <MarketplacePreview />
        <OpportunityMap />
      </div>
    </section>
  );
}
