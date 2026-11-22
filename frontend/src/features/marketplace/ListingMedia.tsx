import {
  Building2,
  CodeXml,
  Coffee,
  Factory,
  HeartPulse,
  ShoppingBag,
} from "lucide-react";
import { listingImageSrc } from "./listing-image-url";

const industryThemes = [
  {
    pattern: /caf[eé]|food|beverage|restaurant|coffee|hospitality/i,
    icon: Coffee,
    colors: "bg-[#ede3d2] text-[#654633]",
  },
  {
    pattern: /software|tech|saas|digital|it services/i,
    icon: CodeXml,
    colors: "bg-[#dce5ed] text-[#314a68]",
  },
  {
    pattern: /retail|commerce|shop/i,
    icon: ShoppingBag,
    colors: "bg-[#e8e1ed] text-[#594866]",
  },
  {
    pattern: /manufactur|industrial|logistic/i,
    icon: Factory,
    colors: "bg-[#e1e6dd] text-[#405344]",
  },
  {
    pattern: /health|care|medical/i,
    icon: HeartPulse,
    colors: "bg-[#ebdedc] text-[#704947]",
  },
];
const defaultTheme = { icon: Building2, colors: "bg-[#e1e9df] text-[#3b584b]" };

export function ListingMedia({
  industry,
  title,
  imageUrl,
  onImageError,
  eager = false,
}: {
  industry: string | null;
  title: string;
  imageUrl: string | null;
  onImageError: () => void;
  eager?: boolean;
}) {
  const theme =
    industryThemes.find(({ pattern }) => pattern.test(industry ?? "")) ??
    defaultTheme;
  const Icon = theme.icon;
  if (imageUrl) {
    return (
      <img
        alt={`Seller-provided image for ${title}`}
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        src={listingImageSrc(imageUrl)}
        onError={onImageError}
      />
    );
  }

  return (
    <div
      className={`absolute inset-0 grid place-items-center overflow-hidden ${theme.colors}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-[size:24px_24px] opacity-[0.10]"
      />
      <div
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-full border border-current/25 bg-white/25 sm:size-24"
      >
        <Icon size={36} strokeWidth={1.3} />
      </div>
      <span className="absolute right-3 bottom-3 rounded-md bg-white/70 px-2 py-1 text-xs font-medium">
        No photo provided
      </span>
    </div>
  );
}
