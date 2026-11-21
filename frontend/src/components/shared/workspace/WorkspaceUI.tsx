import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-50 text-amber-900 ring-1 ring-amber-700/10",
  in_review: "bg-amber-50 text-amber-900 ring-1 ring-amber-700/10",
  proposed: "bg-sky-50 text-sky-900 ring-1 ring-sky-700/10",
  negotiating: "bg-violet-50 text-violet-900 ring-1 ring-violet-700/10",
  due_diligence: "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-700/10",
  accepted: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  published: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  completed: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  rejected: "bg-rose-50 text-rose-900 ring-1 ring-rose-700/10",
  cancelled: "bg-slate-100 text-slate-700",
  withdrawn: "bg-slate-100 text-slate-700",
  superseded: "bg-slate-100 text-slate-700",
  archived: "bg-slate-100 text-slate-700",
  suspended: "bg-rose-50 text-rose-900 ring-1 ring-rose-700/10",
  resolved: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  dismissed: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold capitalize ${statusStyles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="eyebrow text-emerald-800">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-navy-950 sm:text-[2.15rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  href?: string;
}) {
  const content = (
    <Card
      className={`h-full p-5 shadow-none transition ${href ? "hover:border-emerald-800/25 hover:shadow-soft" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
          {label}
        </p>
        {icon ? <span className="text-emerald-800">{icon}</span> : null}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-navy-950">
        {value}
      </p>
      {detail ? (
        <p className="mt-1.5 text-xs leading-5 text-ink-soft">{detail}</p>
      ) : null}
      {href ? <span className="sr-only">Open {label}</span> : null}
    </Card>
  );
  return href ? (
    <Link
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20"
      to={href}
    >
      {content}
    </Link>
  ) : (
    content
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-navy-950">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 shadow-none sm:p-6 ${className}`}>{children}</Card>
  );
}

export function WorkspaceEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-[#FBFCFB] px-5 py-10 text-center">
      <h3 className="text-sm font-semibold text-navy-950">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-ink-soft">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function WorkspaceSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-label="Loading workspace data"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading workspace data</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: Math.min(rows, 4) }, (_, index) => (
          <div className="h-28 animate-pulse rounded-2xl bg-mist" key={index} />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-mist" />
    </div>
  );
}

export function DetailLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 transition hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20"
      to={to}
    >
      {children}
      <ChevronRight aria-hidden="true" size={14} />
    </Link>
  );
}

export function ExternalLikeLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 transition hover:text-emerald-950"
      to={to}
    >
      {children}
      <ArrowUpRight aria-hidden="true" size={13} />
    </Link>
  );
}
