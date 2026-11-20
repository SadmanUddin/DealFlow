export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-40 items-center justify-center gap-3 text-sm text-ink-soft"
      role="status"
    >
      <span className="size-4 animate-spin rounded-full border-2 border-emerald-700/25 border-t-emerald-700" />
      {label}
    </div>
  );
}
