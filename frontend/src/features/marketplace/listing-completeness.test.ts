import { describe, expect, it } from "vitest";
import { getListingCompleteness } from "./listing-completeness";
import { addComparisonListing } from "./comparison-context";

const business = {
  title: "Bakery",
  description: "An established local business with wholesale customers.",
  industry: "Food",
  location: "Ghent",
  askingPrice: "125000.00",
  annualRevenue: "230000",
  ebitda: 0,
  imageUrl: "/api/listings/1/image",
};

describe("listing completeness", () => {
  it("gives a full profile 100% without an optional website and counts zero EBITDA", () => {
    expect(getListingCompleteness(business)).toEqual({
      percentage: 100,
      missingRequired: [],
      missingRecommended: [],
    });
  });

  it("scores a minimal legacy listing using available fields", () => {
    const { title, description } = business;
    expect(getListingCompleteness({ title, description })).toEqual({
      percentage: 25,
      missingRequired: [],
      missingRecommended: [
        "industry",
        "location",
        "asking price",
        "annual revenue",
        "EBITDA",
        "business image",
      ],
    });
  });

  it("counts blank financials and missing images consistently", () => {
    expect(
      getListingCompleteness({
        ...business,
        annualRevenue: "",
        ebitda: null,
        hasImage: false,
      }),
    ).toEqual({
      percentage: 63,
      missingRequired: [],
      missingRecommended: ["annual revenue", "EBITDA", "business image"],
    });
    expect(
      getListingCompleteness({
        ...business,
        description: " ",
        imageUrl: null,
        hasImage: true,
      }),
    ).toEqual({
      percentage: 88,
      missingRequired: ["description"],
      missingRecommended: [],
    });
  });
});

it("ignores duplicate selections without consuming a comparison slot", () => {
  const ids = [1, 2];
  expect(addComparisonListing(ids, 2)).toBe(ids);
  expect(addComparisonListing(addComparisonListing(ids, 3), 4)).toEqual([
    1, 2, 3,
  ]);
});
