import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("uses forwarded button refs to focus the initial action", () => {
    render(
      <ConfirmDialog
        confirmLabel="Confirm"
        description="Confirm this action."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm action?"
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
