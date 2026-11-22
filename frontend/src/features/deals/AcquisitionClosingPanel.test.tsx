import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AcquisitionClosingPanel } from "./AcquisitionClosingPanel";
import { updateAcquisitionClosing, type Deal } from "./api";

vi.mock("./api", () => ({ updateAcquisitionClosing: vi.fn() }));

const accepted: Deal = {
  id: 1,
  listing_id: 1,
  buyer_id: 1,
  seller_id: 2,
  status: "accepted",
  accepted_at: "2026-11-21T12:00:00Z",
  created_at: "2026-11-20T12:00:00Z",
  updated_at: "2026-11-21T12:00:00Z",
  agreed_offer: { currency: "EUR", amount: "115000.00" },
  closing_revision: 1,
  closing_amount: "116500.25",
  closing_currency: "EUR",
  closing_proposed_by: 2,
  closing_agreed_at: "2026-11-21T13:00:00Z",
  seller_confirmed_at: "2026-11-21T14:00:00Z",
};

function renderPanel(deal = accepted) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AcquisitionClosingPanel deal={deal} userId={1} />
    </QueryClientProvider>,
  );
}

it("keeps public price consent unchecked by default and confirms the reviewed revision", async () => {
  const user = userEvent.setup();
  vi.mocked(updateAcquisitionClosing).mockResolvedValue(accepted);
  renderPanel();
  expect(screen.getByText("1 of 2 confirmed")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Confirm completion" }));
  const dialog = within(screen.getByRole("alertdialog"));
  const privacy = dialog.getByRole("checkbox");
  expect(privacy).not.toBeChecked();
  await user.tab({ shift: true });
  expect(privacy).toHaveFocus();
  await user.click(dialog.getByRole("button", { name: "Confirm completion" }));
  expect(updateAcquisitionClosing).toHaveBeenCalledWith(1, {
    action: "confirm",
    revision: 1,
    publicPriceConsent: false,
  });
});

it("shows the dispute and prevents confirmation while closing is paused", () => {
  renderPanel({
    ...accepted,
    closing_disputed_by: 2,
    seller_confirmed_at: null,
  });
  expect(screen.getByText("Closing paused")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Confirm completion" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Resolve dispute" }),
  ).not.toBeInTheDocument();
});

it("disables a confirmation dialog if a refreshed deal has a newer closing revision", async () => {
  const user = userEvent.setup();
  const client = new QueryClient();
  const panel = (deal: Deal) => (
    <QueryClientProvider client={client}>
      <AcquisitionClosingPanel deal={deal} userId={1} />
    </QueryClientProvider>
  );
  const { rerender } = render(panel(accepted));
  await user.click(screen.getByRole("button", { name: "Confirm completion" }));
  rerender(
    panel({ ...accepted, closing_revision: 2, closing_amount: "117000.00" }),
  );
  const dialog = within(screen.getByRole("alertdialog"));
  expect(dialog.getByText(/116,500\.25/)).toBeVisible();
  expect(dialog.getByRole("alert")).toHaveTextContent("Closing has changed");
  expect(
    dialog.getByRole("button", { name: "Confirm completion" }),
  ).toBeDisabled();
});
