import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  confirmDisabled = false,
  error,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/45 p-4 backdrop-blur-[2px]"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-6 shadow-[0_30px_90px_-30px_rgba(11,31,54,0.45)] sm:p-7"
        role="alertdialog"
      >
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-900"
        >
          <span className="text-lg font-semibold">?</span>
        </span>
        <h2
          className="mt-5 text-xl font-semibold tracking-tight text-navy-950"
          id="confirm-dialog-title"
        >
          {title}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-ink-soft"
          id="confirm-dialog-description"
        >
          {description}
        </p>
        {children ? <div className="mt-4">{children}</div> : null}
        {error ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            ref={confirmRef}
            variant="accent"
          >
            {busy ? (busyLabel ?? "Please wait…") : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
