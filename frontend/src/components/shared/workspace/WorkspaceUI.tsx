import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Inbox } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-50 text-amber-900 ring-1 ring-amber-700/10",
  in_review: "bg-amber-50 text-amber-900 ring-1 ring-amber-700/10",
  proposed: "bg-slate-100 text-slate-700",
  negotiating: "bg-blue-50 text-blue-950 ring-1 ring-blue-700/10",
  due_diligence: "bg-blue-50 text-blue-950 ring-1 ring-blue-700/10",
  active: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  accepted: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  published: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-700/10",
  sold: "bg-emerald-950 text-white",
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
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status === "sold" ? "SOLD" : status.replaceAll("_", " ")}
    </span>
  );
}

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  action,
  featured = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  featured?: boolean;
}) {
  return (
    <header
      className={`mb-7 flex min-w-0 flex-wrap items-end justify-between gap-5 rounded-2xl border p-5 sm:p-8 ${featured ? "border-navy-950 bg-navy-950 text-white" : "border-line bg-white text-navy-950"}`}
    >
      <div className="min-w-0">
        <p
          className={`mb-2 text-xs font-semibold tracking-[0.12em] uppercase ${featured ? "text-emerald-200" : "text-emerald-900"}`}
        >
          {eyebrow}
        </p>
        <h1 className="break-words text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p
            className={`mt-2 max-w-2xl text-sm leading-6 sm:text-base ${featured ? "text-slate-200" : "text-ink-soft"}`}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="max-w-full">{action}</div> : null}
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
      className={`h-full min-w-0 p-4 shadow-none transition sm:p-5 ${href ? "hover:border-emerald-800/25 hover:shadow-soft" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-snug font-semibold text-ink-soft">
          {label}
        </p>
        {icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-900">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 break-words text-3xl leading-none font-semibold tracking-tight text-navy-950 tabular-nums">
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-navy-950">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function SectionCard({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card id={id} className={`p-5 shadow-none sm:p-6 ${className}`}>
      {children}
    </Card>
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
    <div className="rounded-xl border border-dashed border-line bg-paper px-4 py-9 text-center">
      <span className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-white text-emerald-900">
        <Inbox size={20} aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-navy-950">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-soft">
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
