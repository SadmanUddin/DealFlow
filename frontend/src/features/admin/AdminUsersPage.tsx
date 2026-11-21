import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Search, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listAdminUsers } from "./api";

const roleOptions = ["all", "buyer", "seller", "admin"] as const;
const statusOptions = ["all", "active", "suspended"] as const;

export function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const queryText = searchParams.get("q") ?? "";
  const role = roleOptions.includes(
    searchParams.get("role") as (typeof roleOptions)[number],
  )
    ? (searchParams.get("role") as (typeof roleOptions)[number])
    : "all";
  const status = statusOptions.includes(
    searchParams.get("status") as (typeof statusOptions)[number],
  )
    ? (searchParams.get("status") as (typeof statusOptions)[number])
    : "all";
  const [inputState, setInputState] = useState({ queryText, input: queryText });
  const input =
    inputState.queryText === queryText ? inputState.input : queryText;
  const query = useQuery({
    queryKey: ["admin", "users", page, 20, queryText, role, status],
    queryFn: () =>
      listAdminUsers({ page, limit: 20, q: queryText, role, status }),
    placeholderData: (previous) => previous,
  });
  const update = (values: {
    q?: string;
    role?: string;
    status?: string;
    page?: number;
  }) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, String(value));
    }
    if (
      values.q !== undefined ||
      values.role !== undefined ||
      values.status !== undefined
    )
      next.delete("page");
    setSearchParams(next);
  };
  const totalPages = query.data?.pagination.totalPages ?? 0;

  return (
    <>
      <WorkspacePageHeader
        description="Review account roles and status. Sensitive changes are sent to the backend and recorded in the administrative audit log."
        eyebrow="Platform operations · Accounts"
        title="User management"
      />
      <SectionCard className="mb-5">
        <form
          className="grid gap-3 md:grid-cols-[minmax(15rem,1fr)_10rem_10rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: input.trim() });
          }}
        >
          <label className="relative block">
            <span className="sr-only">Search users by name or email</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              size={16}
            />
            <input
              className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
              onChange={(event) =>
                setInputState({ queryText, input: event.target.value })
              }
              placeholder="Name or email"
              value={input}
            />
          </label>
          <label className="text-xs font-medium text-ink-soft">
            <span className="sr-only">Filter by role</span>
            <select
              aria-label="Filter by role"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-950 outline-none focus:border-emerald-700"
              onChange={(event) => update({ role: event.target.value })}
              value={role}
            >
              <option value="all">All roles</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by account status</span>
            <select
              aria-label="Filter by account status"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-950 outline-none focus:border-emerald-700"
              onChange={(event) => update({ status: event.target.value })}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <Button type="submit" variant="default">
            <Search aria-hidden="true" size={15} /> Search
          </Button>
        </form>
      </SectionCard>
      {query.isPending ? <WorkspaceSkeleton rows={2} /> : null}
      {query.isError ? (
        <ErrorState
          description="User records could not be loaded."
          onRetry={() => void query.refetch()}
          title="Users unavailable"
        />
      ) : null}
      {query.data ? (
        <SectionCard className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-navy-950">Accounts</h2>
              <p className="mt-1 text-xs text-ink-soft">
                {query.data.pagination.total} matching users
              </p>
            </div>
            <span className="text-xs text-ink-faint">
              Newest accounts first
            </span>
          </div>
          {query.data.users.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-mist/70 text-[0.68rem] uppercase tracking-[0.09em] text-ink-faint">
                    <tr>
                      <th className="px-5 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">
                        Email verification
                      </th>
                      <th className="px-5 py-3 text-right font-semibold">
                        Joined
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {query.data.users.map((user) => (
                      <tr className="transition hover:bg-mist/40" key={user.id}>
                        <td className="px-5 py-4">
                          <Link
                            className="font-semibold text-navy-950 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                            to={`/admin/users/${user.id}`}
                          >
                            {user.name}
                          </Link>
                          <p className="mt-1 text-xs text-ink-soft">
                            {user.email}
                          </p>
                        </td>
                        <td className="px-4 py-4 capitalize">{user.role}</td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            status={user.isActive ? "active" : "suspended"}
                          />
                        </td>
                        <td className="px-4 py-4 text-xs">
                          {user.emailVerified ? "Verified" : "Unverified"}
                        </td>
                        <td className="px-5 py-4 text-right text-xs text-ink-soft">
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                          }).format(new Date(user.createdAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-line md:hidden">
                {query.data.users.map((user) => (
                  <Link
                    className="flex items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                    key={user.id}
                    to={`/admin/users/${user.id}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-emerald-900">
                      <UserRound aria-hidden="true" size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-950">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {user.email}
                      </span>
                      <span className="mt-1 block text-xs capitalize text-ink-faint">
                        {user.role} · {user.isActive ? "active" : "suspended"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
                <p aria-live="polite" className="text-xs text-ink-soft">
                  Page {page} of {Math.max(1, totalPages)}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={page <= 1 || query.isFetching}
                    onClick={() => update({ page: page - 1 })}
                    size="sm"
                    variant="outline"
                  >
                    <ChevronLeft aria-hidden="true" size={15} /> Previous
                  </Button>
                  <Button
                    disabled={page >= totalPages || query.isFetching}
                    onClick={() => update({ page: page + 1 })}
                    size="sm"
                    variant="outline"
                  >
                    Next <ChevronRight aria-hidden="true" size={15} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-5">
              <WorkspaceEmpty
                title="No matching users"
                description="Try adjusting the search or account filters."
              />
            </div>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}
