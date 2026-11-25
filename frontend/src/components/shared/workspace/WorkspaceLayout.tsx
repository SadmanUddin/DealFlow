import { unreadNotificationCountKey } from "@/features/buyer/notification-query-keys";
import {
  Activity,
  Bell,
  Bookmark,
  ChevronDown,
  Compass,
  Building2,
  ChartNoAxesCombined,
  FileText,
  Handshake,
  LayoutDashboard,
  MessageSquareText,
  ShieldCheck,
  Settings2,
  Users,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/features/auth/types";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "@/features/buyer/api";

type WorkspaceLink = {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
};
const navigation: Record<UserRole, WorkspaceLink[]> = {
  buyer: [
    { label: "Overview", to: "/buyer", icon: LayoutDashboard, end: true },
    { label: "Saved businesses", to: "/buyer/saved", icon: Bookmark },
    { label: "Saved searches", to: "/buyer/saved-searches", icon: Bookmark },
    {
      label: "Conversations",
      to: "/buyer/conversations",
      icon: MessageSquareText,
    },
    { label: "Offers", to: "/buyer/offers", icon: Handshake },
    { label: "Deals", to: "/buyer/deals", icon: Building2 },
    { label: "Notifications", to: "/buyer/notifications", icon: Bell },
    { label: "Analytics", to: "/buyer/analytics", icon: ChartNoAxesCombined },
  ],
  seller: [
    { label: "Overview", to: "/seller", icon: LayoutDashboard, end: true },
    { label: "My listings", to: "/seller/listings", icon: Building2 },
    { label: "Inquiries", to: "/seller/inquiries", icon: MessageSquareText },
    {
      label: "Conversations",
      to: "/seller/conversations",
      icon: MessageSquareText,
    },
    { label: "Offers & deals", to: "/seller/deals", icon: Handshake },
    { label: "Documents", to: "/seller/documents", icon: FileText },
    { label: "Analytics", to: "/seller/analytics", icon: ChartNoAxesCombined },
    { label: "Notifications", to: "/seller/notifications", icon: Bell },
  ],
  admin: [
    { label: "Operations", to: "/admin", icon: LayoutDashboard, end: true },
    { label: "Users", to: "/admin/users", icon: Users },
    { label: "Moderation", to: "/admin/moderation", icon: ShieldCheck },
    { label: "Reports", to: "/admin/reports", icon: MessageSquareText },
    { label: "Audit log", to: "/admin/audit", icon: Activity },
  ],
};

const roleLabel: Record<UserRole, string> = {
  buyer: "Acquisition workspace",
  seller: "Seller workspace",
  admin: "Platform operations",
};

export function WorkspaceLayout({ role }: { role: UserRole }) {
  const unreadQuery = useQuery({
    queryKey: unreadNotificationCountKey,
    queryFn: () => listNotifications(1, 1, true),
    enabled: role !== "admin",
    staleTime: 15_000,
  });
  const unreadCount = unreadQuery.data?.pagination.total ?? 0;
  const links = navigation[role].map((item) =>
    item.to.endsWith("/notifications") ? { ...item, badge: unreadCount } : item,
  );
  const { pathname } = useLocation();
  const current = links.find((item) =>
    item.end
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(item.to + "/"),
  );
  const Icon = current?.icon ?? LayoutDashboard;
  const workspaceLinks = <WorkspaceNavigation links={links} />;
  return (
    <div className="min-h-screen bg-paper text-navy-950">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[94rem] min-w-0 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside
          className="min-w-0 border-b border-line bg-white lg:border-r lg:border-b-0"
          aria-label={roleLabel[role]}
        >
          <div className="hidden lg:sticky lg:top-[4.5rem] lg:flex lg:max-h-[calc(100dvh-4.5rem)] lg:min-h-[32rem] lg:flex-col lg:overflow-y-auto lg:px-4 lg:py-7">
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-navy-950 px-3 py-3 text-white">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-emerald-200">
                {role === "admin" ? (
                  <ShieldCheck size={18} aria-hidden="true" />
                ) : (
                  <Building2 size={18} aria-hidden="true" />
                )}
              </span>
              <h2 className="text-sm font-semibold leading-tight">
                {roleLabel[role]}
              </h2>
            </div>
            {workspaceLinks}
            <WorkspaceUtilities />
          </div>
          <details
            key={pathname}
            className="group px-4 py-2.5 sm:px-6 lg:hidden"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-800 [&::-webkit-details-marker]:hidden">
              <Icon size={17} aria-hidden="true" className="text-emerald-800" />
              <span className="min-w-0 flex-1 truncate">
                {current?.label ?? roleLabel[role]}
              </span>
              <span className="text-xs font-medium text-ink-soft">
                Workspace menu
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className="transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="pb-2 pt-2">
              {workspaceLinks}
              <WorkspaceUtilities />
            </div>
          </details>
        </aside>
        <main
          className="min-w-0 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10"
          id="main-content"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function WorkspaceNavigation({
  links,
}: {
  links: (WorkspaceLink & { badge?: number })[];
}) {
  return (
    <nav
      aria-label="Workspace"
      className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1"
    >
      {links.map(({ icon: Icon, label, to, end, badge = 0 }) => (
        <NavLink
          className={({ isActive }) =>
            `flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg border px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${isActive ? "border-emerald-100 bg-emerald-50 font-semibold text-emerald-950" : "border-transparent text-ink-soft hover:bg-paper hover:text-navy-950"}`
          }
          end={end}
          key={to}
          to={to}
        >
          <Icon aria-hidden="true" size={17} className="shrink-0" />
          <span>{label}</span>
          {badge > 0 ? (
            <span
              aria-label={`${badge} unread notifications`}
              className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-950"
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

function WorkspaceUtilities() {
  return (
    <div className="mt-5 space-y-1 border-t border-line pt-4">
      <Link
        className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft hover:bg-paper hover:text-navy-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
        to="/account"
      >
        <Settings2 aria-hidden="true" size={17} /> Account settings
      </Link>
      <Link
        className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft hover:bg-paper hover:text-navy-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
        to="/marketplace"
      >
        <Compass aria-hidden="true" size={17} /> Marketplace
      </Link>
    </div>
  );
}
