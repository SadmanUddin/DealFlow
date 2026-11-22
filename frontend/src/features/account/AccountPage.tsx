import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router";
import { Link, useNavigate } from "react-router";
import { WorkspacePageHeader } from "@/components/shared/workspace/WorkspaceUI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { toApiError } from "@/lib/api-error";
import { authQueryKeys, getProfile, updateProfile } from "@/features/auth/api";
import { profileSchema, type ProfileValues } from "@/features/auth/schemas";
import { useAuth } from "@/features/auth/useAuth";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { clearPrivateQueryCache } from "@/app/providers/query-cache";
import {
  deactivateAccount,
  getEmailPreferences,
  updateEmailPreferences,
  type EmailPreferences,
} from "@/features/auth/api";

import { AdminMfaPanel } from "./AdminMfaPanel";

export function AccountPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: sessionUser } = useAuth();
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [deactivateError, setDeactivateError] = useState("");
  const profileQuery = useQuery({
    queryKey: authQueryKeys.profile,
    queryFn: getProfile,
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: (name: string) => updateProfile(name),
    onSuccess: (profile) => {
      queryClient.setQueryData(authQueryKeys.profile, profile);
      queryClient.setQueryData(authQueryKeys.session, (current) =>
        current ? { ...current, name: profile.name } : current,
      );
      setSavedMessage("Your profile has been updated.");
      setFormError("");
    },
  });
  const preferencesQuery = useQuery({
    queryKey: ["account", "email-preferences"],
    queryFn: getEmailPreferences,
    retry: false,
  });
  const preferencesMutation = useMutation({
    mutationFn: (value: EmailPreferences) => updateEmailPreferences(value),
    onSuccess: (value) => {
      queryClient.setQueryData(["account", "email-preferences"], value);
      setSavedMessage("Notification preferences updated.");
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAccount(deactivatePassword),
    onSuccess: async () => {
      setDeactivateOpen(false);
      setDeactivatePassword("");
      queryClient.setQueryData(authQueryKeys.session, null);
      await clearPrivateQueryCache(queryClient);
      queryClient.removeQueries({ queryKey: authQueryKeys.profile });
      navigate("/login", {
        replace: true,
        state: { notice: "Your account has been deactivated." },
      });
    },
    onError: (reason) => setDeactivateError(toApiError(reason).message),
  });
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });
  useEffect(() => {
    if (profileQuery.data) form.reset({ name: profileQuery.data.name });
  }, [form, profileQuery.data]);
  const notice = (location.state as { notice?: string } | null)?.notice;

  if (profileQuery.isPending)
    return (
      <section className="page-container py-16">
        <LoadingState label="Loading your profile" />
      </section>
    );
  if (profileQuery.error || !profileQuery.data) {
    return (
      <section className="page-container py-16">
        <ErrorState
          title="Profile unavailable"
          description={toApiError(profileQuery.error).message}
        />
      </section>
    );
  }

  const profile = profileQuery.data;
  const submit = form.handleSubmit(async ({ name }) => {
    setFormError("");
    setSavedMessage("");
    try {
      await updateMutation.mutateAsync(name);
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <section className="page-container min-h-[65vh] py-12 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <WorkspacePageHeader
          eyebrow="Your DealFlow account"
          title="Account settings"
          description="Manage your profile, email preferences, and account access."
          action={
            sessionUser ? (
              <Button asChild variant="outline">
                <Link to={`/${sessionUser.role}`}>Back to workspace</Link>
              </Button>
            ) : undefined
          }
        />
        {notice && (
          <p
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            {notice}
          </p>
        )}
        {!profile.emailVerified && (
          <div className="mt-5 flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center">
            <p className="text-sm text-amber-950">
              Verify your email to finish setting up your account. Use the link
              in your verification email or request a new one.
            </p>
            <a
              className="shrink-0 text-sm font-semibold text-emerald-900 underline"
              href="/verify-email"
            >
              Enter verification token
            </a>
          </div>
        )}
        <div className="mt-7 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Card>
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold text-navy-950">
                Account information
              </h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-ink-faint">Email address</dt>
                  <dd className="mt-1 break-all font-medium text-navy-950">
                    {profile.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Account type</dt>
                  <dd className="mt-1 capitalize font-medium text-navy-950">
                    {profile.role}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Email status</dt>
                  <dd className="mt-1">
                    <Badge
                      className={
                        profile.emailVerified
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }
                    >
                      {profile.emailVerified
                        ? "Verified"
                        : "Pending verification"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Account status</dt>
                  <dd className="mt-1 font-medium text-navy-950">
                    {profile.isActive ? "Active" : "Inactive"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Member since</dt>
                  <dd className="mt-1 font-medium text-navy-950">
                    {profile.createdAt
                      ? new Date(profile.createdAt).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold text-navy-950">
                Edit profile
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Only your display name can be changed from this page.
              </p>
              <form className="mt-5 space-y-4" noValidate onSubmit={submit}>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-navy-950"
                    htmlFor="profile-name"
                  >
                    Full name
                  </label>
                  <input
                    className="h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
                    id="profile-name"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    aria-describedby={
                      form.formState.errors.name
                        ? "profile-name-error"
                        : undefined
                    }
                    {...form.register("name")}
                  />
                  {form.formState.errors.name?.message && (
                    <p
                      className="mt-1.5 text-xs font-medium text-red-700"
                      id="profile-name-error"
                    >
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                {formError && (
                  <p
                    aria-live="polite"
                    className="text-sm text-red-700"
                    role="alert"
                  >
                    {formError}
                  </p>
                )}
                {savedMessage && (
                  <p
                    aria-live="polite"
                    className="text-sm text-emerald-800"
                    role="status"
                  >
                    {savedMessage}
                  </p>
                )}
                <Button
                  disabled={updateMutation.isPending}
                  type="submit"
                  variant="accent"
                >
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <p className="mt-6 text-xs text-ink-faint">
          Signed in as {sessionUser?.email ?? profile.email}.
        </p>
        <Card className="mt-6">
          <CardContent className="p-6 sm:p-7">
            <h2 className="text-lg font-semibold text-navy-950">
              Email notification preferences
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Choose which marketplace and deal updates may be sent by email.
            </p>
            {preferencesQuery.isPending ? (
              <p className="mt-4 text-sm text-ink-soft">Loading preferences…</p>
            ) : null}
            {preferencesQuery.isError ? (
              <ErrorState
                title="Preferences unavailable"
                description={toApiError(preferencesQuery.error).message}
                onRetry={() => void preferencesQuery.refetch()}
              />
            ) : null}
            {preferencesQuery.data ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["listingStatus", "Listing status changes"],
                    ["listingPrice", "Listing price changes"],
                    ["listingDetails", "Listing detail changes"],
                    ["dealUpdates", "Deal updates"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-paper p-3 text-sm transition-colors hover:border-emerald-200"
                  >
                    <input
                      type="checkbox"
                      checked={preferencesQuery.data[key]}
                      disabled={preferencesMutation.isPending}
                      onChange={(event) => {
                        const current = preferencesQuery.data;
                        if (!current) return;
                        preferencesMutation.mutate({
                          listingStatus:
                            key === "listingStatus"
                              ? event.target.checked
                              : current.listingStatus,
                          listingPrice:
                            key === "listingPrice"
                              ? event.target.checked
                              : current.listingPrice,
                          listingDetails:
                            key === "listingDetails"
                              ? event.target.checked
                              : current.listingDetails,
                          dealUpdates:
                            key === "dealUpdates"
                              ? event.target.checked
                              : current.dealUpdates,
                        });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            ) : null}
            {preferencesMutation.isError ? (
              <p role="alert" className="mt-3 text-sm text-rose-800">
                {toApiError(preferencesMutation.error).message}
              </p>
            ) : null}
            <div className="mt-7 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-red-800">
                Deactivate account
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
                Deactivation signs you out, revokes active sessions, and
                prevents further account access. Your records may remain where
                required for active marketplace transactions.
              </p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => {
                  setDeactivateError("");
                  setDeactivatePassword("");
                  setDeactivateOpen(true);
                }}
              >
                Deactivate account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {sessionUser?.role === "admin" && <AdminMfaPanel />}
      {deactivateOpen ? (
        <ConfirmDialog
          title="Deactivate your account?"
          description="You will be signed out immediately and cannot use this account again. Confirm with your current password."
          confirmLabel="Deactivate account"
          busyLabel="Deactivating…"
          busy={deactivateMutation.isPending}
          confirmDisabled={!deactivatePassword}
          error={deactivateError}
          onCancel={() => setDeactivateOpen(false)}
          onConfirm={() => deactivateMutation.mutate()}
        >
          <label
            className="block text-sm font-medium"
            htmlFor="deactivate-password"
          >
            Current password
          </label>
          <input
            autoComplete="current-password"
            id="deactivate-password"
            type="password"
            value={deactivatePassword}
            onChange={(event) => setDeactivatePassword(event.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-line px-3 text-sm"
          />
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
