import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";
import { ApiError } from "@/lib/api-error";

describe("ErrorState rate-limit feedback", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the API message and waits for Retry-After before enabling retry", async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(
      <ErrorState
        error={
          new ApiError("Too many requests. Try again in 2 seconds.", {
            status: 429,
            retryAfterSeconds: 2,
          })
        }
        onRetry={onRetry}
      />,
    );

    expect(
      screen.getByText("Too many requests. Try again in 2 seconds."),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry in 2s" });
    expect(retry).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
