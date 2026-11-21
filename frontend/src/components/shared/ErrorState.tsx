import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toApiError } from "@/lib/api-error";

export function ErrorState({
  title = "We couldn’t load this content",
  description = "Please try again in a moment.",
  onRetry,
  error,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  error?: unknown;
}) {
  const apiError = useMemo(() => (error ? toApiError(error) : null), [error]);
  const waitSeconds =
    apiError?.status === 429 ? (apiError.retryAfterSeconds ?? 30) : 0;
  const countdownKey = `${apiError?.status ?? ""}:${apiError?.message ?? ""}:${waitSeconds}`;
  const [countdown, setCountdown] = useState({ key: "", seconds: 0 });

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const deadline = Date.now() + waitSeconds * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown({ key: countdownKey, seconds });
      if (seconds === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [countdownKey, waitSeconds]);

  const secondsLeft =
    countdown.key === countdownKey ? countdown.seconds : waitSeconds;

  const message =
    apiError?.status === 429
      ? apiError.message
      : error
        ? apiError?.message
        : description;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="text-rose-700" size={20} />
      <h2 className="mt-3 font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{message}</p>
      {onRetry ? (
        <Button
          className="mt-4"
          disabled={secondsLeft > 0}
          onClick={onRetry}
          size="sm"
          variant="outline"
        >
          {secondsLeft > 0 ? `Retry in ${secondsLeft}s` : "Try again"}
        </Button>
      ) : null}
    </section>
  );
}
