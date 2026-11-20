import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = 'We couldn’t load this content',
  description = 'Please try again in a moment.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="text-rose-700" size={20} />
      <h2 className="mt-3 font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{description}</p>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry} size="sm" variant="outline">
          Try again
        </Button>
      ) : null}
    </section>
  );
}
