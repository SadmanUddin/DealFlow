import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AudienceLandingPage } from "./AudienceLandingPage";

describe("audience landing pages", () => {
  it("explains the buyer workflow and links to supported actions", () => {
    render(
      <MemoryRouter>
        <AudienceLandingPage audience="buyers" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /find the right business/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /browse businesses/i }),
    ).toHaveAttribute("href", "/marketplace");
    expect(
      screen.getByText(/submit offers and follow deal activity/i),
    ).toBeInTheDocument();
  });

  it("explains the seller workflow and links to registration", () => {
    render(
      <MemoryRouter>
        <AudienceLandingPage audience="sellers" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /manage buyer interest/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create a seller account/i }),
    ).toHaveAttribute("href", "/register?role=seller");
    expect(screen.getByText(/submit it for moderation/i)).toBeInTheDocument();
  });
});
