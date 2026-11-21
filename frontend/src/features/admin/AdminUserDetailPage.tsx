import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ShieldCheck,
  UserRound,
  Ban,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  StatusBadge,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";
import {
  changeAdminUserRole,
  changeAdminUserStatus,
  getAdminUser,
  revokeAdminUserSessions,
  type AdminUser,
} from "./api";

type Action = {
  kind: "suspend" | "reactivate" | "role" | "sessions";
  role?: AdminUser["role"];
};

export function AdminUserDetailPage() {
  const id = Number(useParams().id);
  const { user: currentUser } = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [nextRole, setNextRole] = useState<AdminUser["role"]>("buyer");
  const [action, setAction] = useState<Action | null>(null);
  const [failure, setFailure] = useState("");
  const query = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => getAdminUser(id),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  const mutation = useMutation({
    mutationFn: async (selected: Action) => {
      const cleanReason = reason.trim();
      if (selected.kind === "suspend" || selected.kind === "reactivate")
        return changeAdminUserStatus(id, {
          action: selected.kind,
          reason: cleanReason,
        });
      if (selected.kind === "role" && selected.role)
        return changeAdminUserRole(id, {
          role: selected.role,
          reason: cleanReason,
        });
      if (selected.kind === "sessions")
        return revokeAdminUserSessions(id, cleanReason);
      throw new Error("Unsupported administrative action");
    },
    onSuccess: async () => {
      setAction(null);
      setReason("");
      setFailure("");
      await client.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const target = query.data?.user;
  const ownAccount = target?.id === currentUser?.id;
  const validReason = reason.trim().length >= 3;
  const requestAction = (next: Action) => {
    setFailure("");
    setNextRole(next.role ?? target?.role ?? "buyer");
    setAction(next);
  };
  const title =
    action?.kind === "suspend"
      ? "Suspend this account?"
      : action?.kind === "reactivate"
        ? "Reactivate this account?"
        : action?.kind === "role"
          ? "Change account role?"
          : "Revoke active sessions?";
  const detail =
    action?.kind === "suspend"
      ? "The user’s active sessions will be revoked and they will lose access."
      : action?.kind === "reactivate"
        ? "The account will be able to sign in again."
        : action?.kind === "role"
          ? `This will change the account role to ${action.role}. Existing sessions will be revoked.`
          : "All active sessions for this account will be revoked.";

  return (
    <>
      <WorkspacePageHeader
        description="Review account status and apply audited administrative actions."
        eyebrow="Platform operations · User record"
        title={target?.name ?? "User details"}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/users">
              <ArrowLeft aria-hidden="true" size={15} /> All users
            </Link>
          </Button>
        }
      />
      {!Number.isSafeInteger(id) || id <= 0 ? (
        <ErrorState
          error={query.error}
          description="The user identifier in this address is invalid."
          title="User record unavailable"
        />
      ) : null}
      {Number.isSafeInteger(id) && id > 0 && query.isPending ? (
        <WorkspaceSkeleton rows={2} />
      ) : null}
      {query.isError ? (
        <ErrorState
          description="This account could not be loaded. It may have been removed or your session may have expired."
          onRetry={() => void query.refetch()}
          title="User record unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-none sm:p-7">
            <div className="flex items-start gap-4 border-b border-line pb-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mist text-emerald-900">
                <UserRound aria-hidden="true" size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-lg font-semibold text-navy-950">
                  {target?.name}
                </h2>
                <p className="mt-1 break-words text-sm text-ink-soft">
                  {target?.email}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={target?.role ?? "buyer"} />
                  <StatusBadge
                    status={target?.isActive ? "active" : "suspended"}
                  />
                  <StatusBadge
                    status={target?.emailVerified ? "verified" : "unverified"}
                  />
                </div>
              </div>
            </div>
            <dl className="grid gap-5 pt-5 sm:grid-cols-2">
              <Info label="User ID" value={`#${target?.id}`} />
              <Info
                label="Account created"
                value={new Intl.DateTimeFormat(undefined, {
                  dateStyle: "long",
                }).format(new Date(target!.createdAt))}
              />
              <Info
                label="Last profile update"
                value={new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                }).format(new Date(target!.updatedAt))}
              />
              <Info
                label="Active sessions"
                value={query.data.activeSessionCount}
              />
            </dl>
            {!target?.isActive && target?.suspensionReason ? (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-900">
                  Suspension reason
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-950">
                  {target.suspensionReason}
                </p>
              </div>
            ) : null}
          </section>
          <aside className="h-fit rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="text-emerald-800"
                size={18}
              />
              <h2 className="text-sm font-semibold text-navy-950">
                Administrative actions
              </h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-soft">
              Every change is validated and audited by the backend. Provide a
              reason for the audit record.
            </p>
            <label className="mt-5 block text-xs font-semibold text-navy-950">
              Reason
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
                placeholder="At least 3 characters"
                value={reason}
              />
            </label>
            <div className="mt-4 space-y-2">
              {target?.isActive ? (
                <Button
                  className="w-full"
                  disabled={!validReason || ownAccount}
                  onClick={() => requestAction({ kind: "suspend" })}
                  variant="outline"
                >
                  <Ban aria-hidden="true" size={15} /> Suspend account
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={!validReason}
                  onClick={() => requestAction({ kind: "reactivate" })}
                  variant="outline"
                >
                  <RefreshCw aria-hidden="true" size={15} /> Reactivate account
                </Button>
              )}
              <label className="block text-xs font-semibold text-ink-soft">
                Change role
                <select
                  className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-950"
                  onChange={(event) =>
                    setNextRole(event.target.value as AdminUser["role"])
                  }
                  value={nextRole}
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <Button
                className="w-full"
                disabled={
                  !validReason ||
                  nextRole === target?.role ||
                  (ownAccount && nextRole !== "admin")
                }
                onClick={() => requestAction({ kind: "role", role: nextRole })}
                variant="outline"
              >
                Apply role change
              </Button>
              <Button
                className="w-full"
                disabled={
                  !validReason ||
                  ownAccount ||
                  query.data.activeSessionCount === 0
                }
                onClick={() => requestAction({ kind: "sessions" })}
                variant="outline"
              >
                Revoke active sessions
              </Button>
            </div>
            {ownAccount ? (
              <p className="mt-3 text-xs leading-5 text-amber-900">
                Your own account cannot be suspended, demoted or have sessions
                revoked here.
              </p>
            ) : null}
            {failure && !action ? (
              <p className="mt-3 text-xs text-rose-800" role="alert">
                {failure}
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}
      {action ? (
        <ConfirmDialog
          busy={mutation.isPending}
          busyLabel="Applying…"
          confirmLabel={
            action.kind === "sessions"
              ? "Revoke sessions"
              : action.kind === "role"
                ? "Change role"
                : action.kind === "suspend"
                  ? "Suspend account"
                  : "Reactivate account"
          }
          description={`${detail} Reason: ${reason.trim()}`}
          error={failure}
          onCancel={() => {
            if (!mutation.isPending) setAction(null);
          }}
          onConfirm={() => mutation.mutate(action)}
          title={title ?? "Confirm administrative action"}
        />
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-semibold text-navy-950">
        {value}
      </dd>
    </div>
  );
}
