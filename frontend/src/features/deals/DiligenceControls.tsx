import { Button } from "@/components/ui/button";

export const diligenceControl =
  "mt-1 min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy-950 focus-visible:outline-2 focus-visible:outline-emerald-700";
export const diligenceLabel = "block text-xs font-semibold text-ink-soft";
export const diligenceCard =
  "min-w-0 rounded-xl border border-line bg-paper p-4";

export function DiligencePager({
  label,
  page,
  total,
  size,
  change,
}: {
  label: string;
  page: number;
  total: number;
  size: number;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages === 1 && page === 1) return null;
  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => change(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>
      <span className="text-xs text-ink-soft">
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => change(page + 1)}
        disabled={page >= pages}
      >
        Next
      </Button>
    </nav>
  );
}
