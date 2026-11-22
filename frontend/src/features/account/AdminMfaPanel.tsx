import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";

type MfaStatus = { enrolled: boolean; required: boolean; configured: boolean };
type Enrollment = { secret: string; qr: string };
type Operation = "enroll" | "activate" | "recovery" | "remove";

export function AdminMfaPanel() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const status = useQuery({
    queryKey: ["account", "admin-mfa"],
    queryFn: async () =>
      (await apiClient.get<MfaStatus>("/auth/admin-mfa")).data,
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [result, setResult] = useState<{ codes?: string[] } | null>(null);
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      if (operation === "enroll") {
        const { data } = await apiClient.post<Enrollment>(
          "/auth/admin-mfa/enroll",
          { password },
        );
        setEnrollment(data);
        return;
      }
      const { data } = await apiClient.post<{ recoveryCodes?: string[] }>(
        `/auth/admin-mfa/${operation}`,
        { password, code },
      );
      setEnrollment(null);
      setPassword("");
      setCode("");
      setResult({ codes: data.recoveryCodes });
    },
  });

  return (
    <section
      className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-7"
      aria-labelledby="mfa-heading"
    >
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-forest" aria-hidden="true" />
        <h2 id="mfa-heading" className="text-lg font-semibold text-navy-950">
          Administrator MFA
        </h2>
      </div>
      {result ? (
        <div className="mt-4 space-y-4" role="status">
          <p>Security settings updated. Sign in again to continue.</p>
          {result.codes && (
            <>
              <p className="text-sm text-ink-soft">
                Save these single-use codes somewhere secure. This is the only
                time they will be shown.
              </p>
              <ul
                aria-label="Recovery codes"
                className="grid gap-2 sm:grid-cols-2"
              >
                {result.codes.map((item) => (
                  <li
                    key={item}
                    className="break-all rounded-lg bg-mist p-2 font-mono text-sm"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              await refreshSession();
              navigate("/login", { replace: true });
            }}
          >
            Return to sign in
          </Button>
        </div>
      ) : status.isPending ? (
        <p role="status" className="mt-3">
          Loading security settings…
        </p>
      ) : status.isError ? (
        <p role="alert" className="mt-3">
          {toApiError(status.error).status === 404
            ? "The connected API does not provide administrator MFA settings. Contact your operator."
            : "Security settings are unavailable."}{" "}
          <button className="underline" onClick={() => void status.refetch()}>
            Try again
          </button>
        </p>
      ) : !status.data?.configured ? (
        <p className="mt-3 text-ink-soft">
          MFA enrollment is unavailable. Contact your operator.
        </p>
      ) : (
        <form
          className="mt-4 max-w-xl space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(
              enrollment
                ? "activate"
                : status.data.enrolled
                  ? "recovery"
                  : "enroll",
            );
          }}
        >
          <p className="text-sm text-ink-soft">
            {status.data.enrolled
              ? "MFA is active. Confirm your password and enter a fresh code to manage recovery."
              : "Use an authenticator app to protect your administrator account."}
          </p>
          <label className="block text-sm font-medium">
            Current password
            <input
              className="mt-1 block h-11 w-full rounded-lg border border-line px-3"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {enrollment && (
            <div className="rounded-xl border border-line bg-mist p-4">
              <img
                alt="Authenticator setup QR code"
                src={enrollment.qr}
                width={192}
                height={192}
              />
              <p className="mt-3 text-sm">Manual setup key</p>
              <code className="break-all">{enrollment.secret}</code>
            </div>
          )}
          {(enrollment || status.data.enrolled) && (
            <label className="block text-sm font-medium">
              {enrollment
                ? "Authenticator code"
                : "Authenticator or recovery code"}
              <input
                className="mt-1 block h-11 w-full rounded-lg border border-line px-3"
                autoComplete="one-time-code"
                required
                maxLength={32}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          {mutation.isError && (
            <p role="alert" className="text-sm text-rose-800">
              {toApiError(mutation.error).message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="accent"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Working…"
                : enrollment
                  ? "Activate MFA"
                  : status.data.enrolled
                    ? "Replace recovery codes"
                    : "Set up MFA"}
            </Button>
            {status.data.enrolled && !status.data.required && (
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending || !password || !code}
                onClick={() => mutation.mutate("remove")}
              >
                Remove MFA
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
