import { AudienceSection } from "./sections/AudienceSection";
import { FinalCtaSection } from "./sections/FinalCtaSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { MarketplacePreviewSection } from "./sections/MarketplacePreviewSection";
import { RecentlySoldSection } from "./sections/RecentlySoldSection";
import { TrustSection } from "./sections/TrustSection";
import { WhyDealFlowSection } from "./sections/WhyDealFlowSection";

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <WhyDealFlowSection />
      <MarketplacePreviewSection />
      <RecentlySoldSection />
      <TrustSection />
      <AudienceSection />
      <FinalCtaSection />
    </>
  );
}
