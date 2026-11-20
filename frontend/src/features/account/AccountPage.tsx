import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { toApiError } from "@/lib/api-error";
import { authQueryKeys, getProfile, updateProfile } from "@/features/auth/api";
import { profileSchema, type ProfileValues } from "@/features/auth/schemas";
import { useAuth } from "@/features/auth/useAuth";

export function AccountPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user: sessionUser } = useAuth();
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
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
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow text-emerald-800">Your DealFlow account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-navy-950">
          Profile and account details
        </h1>
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
              Email verification is pending. Verification email delivery is not
              currently available.
            </p>
            <a
              className="shrink-0 text-sm font-semibold text-emerald-900 underline"
              href="/verify-email"
            >
              Enter verification token
            </a>
          </div>
        )}
        <div className="mt-7 grid gap-6 md:grid-cols-[1fr_1.15fr]">
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
      </div>
    </section>
  );
}
