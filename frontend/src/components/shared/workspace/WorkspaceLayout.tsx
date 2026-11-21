import {
  Activity,
  Bell,
  Bookmark,
  Building2,
  ChartNoAxesCombined,
  FileText,
  Handshake,
  LayoutDashboard,
  MessageSquareText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
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
    queryKey: ["notifications", "unread-count"],
    queryFn: () => listNotifications(1, 1, true),
    enabled: role !== "admin",
    staleTime: 15_000,
  });
  const unreadCount = unreadQuery.data?.pagination.total ?? 0;
  const links = navigation[role].map((item) =>
    item.to.endsWith("/notifications") ? { ...item, badge: unreadCount } : item,
  );
  return (
    <div className="min-h-screen bg-[#F7F9F7] text-navy-950">
      <SiteHeader />
      <div className="page-container grid min-h-[calc(100vh-4.5rem)] gap-7 py-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10 lg:py-9">
        <aside
          aria-label={`${role} workspace navigation`}
          className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]"
        >
          <div className="hidden h-full flex-col lg:flex">
            <div className="border-b border-line pb-5">
              <p className="eyebrow text-emerald-800">DealFlow</p>
              <h2 className="mt-2 text-sm font-semibold text-navy-950">
                {roleLabel[role]}
              </h2>
              <Link
                className="mt-3 inline-flex text-xs font-medium text-ink-soft transition hover:text-emerald-800"
                to="/marketplace"
              >
                Browse public marketplace{" "}
                <span aria-hidden="true" className="ml-1">
                  ↗
                </span>
              </Link>
            </div>
            <nav
              aria-label="Workspace"
              className="mt-5 flex flex-1 flex-col gap-1"
            >
              {links.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.82rem] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/15 ${isActive ? "bg-emerald-50 text-emerald-900" : "text-ink-soft hover:bg-white hover:text-navy-950"}`
                    }
                    end={item.end}
                    key={item.to}
                    to={item.to}
                  >
                    <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                    {item.label}
                    {"badge" in item && item.badge > 0 ? (
                      <span
                        aria-label={`${item.badge} unread notifications`}
                        className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-900"
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
            <Link
              className="border-t border-line pt-4 text-xs font-medium text-ink-soft transition hover:text-navy-950"
              to="/account"
            >
              Account settings
            </Link>
          </div>
          <div className="overflow-x-auto lg:hidden">
            <nav
              aria-label="Workspace navigation"
              className="flex min-w-max gap-1 rounded-xl border border-line bg-white p-1.5"
            >
              {links.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? "bg-emerald-50 text-emerald-900" : "text-ink-soft hover:bg-mist"}`
                    }
                    end={item.end}
                    key={item.to}
                    to={item.to}
                  >
                    <Icon aria-hidden="true" size={15} />
                    {item.label}
                    {"badge" in item && item.badge > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-emerald-900">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 pb-10" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
