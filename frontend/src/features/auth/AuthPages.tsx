import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { toApiError } from "@/lib/api-error";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
  type ForgotPasswordValues,
  type ResetPasswordValues,
  type SignInValues,
  type SignUpValues,
  type VerifyEmailValues,
} from "./schemas";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./useAuth";
import {
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
  verifyEmail,
} from "./api";

function FieldError({ children, id }: { children?: string; id: string }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-red-700" id={id}>
      {children}
    </p>
  );
}

function TextField({
  id,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium text-navy-950"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy-950 outline-none transition placeholder:text-ink-faint focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 aria-[invalid=true]:border-red-500"
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function PasswordField({
  id,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium text-navy-950"
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative">
        <input
          className="h-11 w-full rounded-xl border border-line bg-white px-3.5 pr-11 text-sm text-navy-950 outline-none transition placeholder:text-ink-faint focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 aria-[invalid=true]:border-red-500"
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <button
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-soft hover:text-navy-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden="true" size={17} />
          ) : (
            <Eye aria-hidden="true" size={17} />
          )}
        </button>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function SubmitButton({
  children,
  pending,
}: {
  children: string;
  pending: boolean;
}) {
  return (
    <Button
      className="mt-2 w-full"
      disabled={pending}
      size="lg"
      type="submit"
      variant="accent"
    >
      {pending && (
        <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
      )}
      {pending ? "Please wait…" : children}
    </Button>
  );
}

function FormAlert({
  children,
  success = false,
}: {
  children?: string;
  success?: boolean;
}) {
  if (!children) return null;
  return (
    <div
      aria-live="polite"
      className={`rounded-xl border px-3.5 py-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}
      role="status"
    >
      {children}
    </div>
  );
}

function safeReturnTo(state: unknown) {
  const from = (
    state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null
  )?.from;
  const pathname = from?.pathname;
  if (
    !pathname ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname === "/login" ||
    pathname === "/register"
  )
    return "/account";
  return `${pathname}${from?.search ?? ""}${from?.hash ?? ""}`;
}

export function LoginPage() {
  const { login, isSigningIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const submit = handleSubmit(async (values) => {
    setFormError("");
    try {
      await login(values);
      navigate(safeReturnTo(location.state), { replace: true });
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <AuthLayout>
      <p className="eyebrow text-emerald-800">Welcome back</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">
        Sign in to DealFlow
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Continue your business transition with confidence.
      </p>
      <form className="mt-7 space-y-5" noValidate onSubmit={submit}>
        <TextField
          autoComplete="email"
          error={errors.email?.message}
          id="email"
          label="Email address"
          type="email"
          {...register("email")}
        />
        <div className="space-y-2">
          <PasswordField
            autoComplete="current-password"
            error={errors.password?.message}
            id="password"
            label="Password"
            {...register("password")}
          />
          <div className="text-right">
            <Link
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-900"
              to="/forgot-password"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <FormAlert>{formError}</FormAlert>
        <SubmitButton pending={isSigningIn}>Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        New to DealFlow?{" "}
        <Link
          className="font-semibold text-emerald-800 hover:underline"
          to="/register"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register: createAccount, isSigningUp } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { role: "buyer" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError("");
    try {
      const result = await createAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
      });
      navigate("/verify-email", {
        replace: true,
        state: { email: result.email, notice: result.message },
      });
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <AuthLayout>
      <p className="eyebrow text-emerald-800">Get started</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">
        Create your account
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Join as a buyer or seller and take the next step.
      </p>
      <form className="mt-7 space-y-4" noValidate onSubmit={submit}>
        <TextField
          autoComplete="name"
          error={errors.name?.message}
          id="name"
          label="Full name"
          {...register("name")}
        />
        <TextField
          autoComplete="email"
          error={errors.email?.message}
          id="email"
          label="Email address"
          type="email"
          {...register("email")}
        />
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-navy-950"
            htmlFor="role"
          >
            I’m joining as a
          </label>
          <select
            className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
            id="role"
            {...register("role")}
          >
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
          </select>
          <FieldError id="role-error">{errors.role?.message}</FieldError>
        </div>
        <PasswordField
          autoComplete="new-password"
          error={errors.password?.message}
          id="password"
          label="Password"
          {...register("password")}
        />
        <PasswordField
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          id="confirm-password"
          label="Confirm password"
          {...register("confirmPassword")}
        />
        <p className="-mt-1 text-xs leading-5 text-ink-faint">
          Use at least 12 characters. Passwords are limited to 72 UTF-8 bytes.
        </p>
        <FormAlert>{formError}</FormAlert>
        <SubmitButton pending={isSigningUp}>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link
          className="font-semibold text-emerald-800 hover:underline"
          to="/login"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const submit = handleSubmit(async (values) => {
    setFormError("");
    setSuccess("");
    try {
      const result = await requestPasswordReset(values.email);
      setSuccess(
        `${result.message} This backend currently does not deliver password reset emails, so a reset link may not arrive.`,
      );
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <AuthLayout>
      <p className="eyebrow text-emerald-800">Account recovery</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">
        Forgot your password?
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Enter the email address associated with your account.
      </p>
      <form className="mt-7 space-y-5" noValidate onSubmit={submit}>
        <TextField
          autoComplete="email"
          error={errors.email?.message}
          id="email"
          label="Email address"
          type="email"
          {...register("email")}
        />
        <FormAlert success>{success}</FormAlert>
        <FormAlert>{formError}</FormAlert>
        <SubmitButton pending={isSubmitting}>Request reset</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-semibold text-emerald-800 hover:underline"
          to="/login"
        >
          Return to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { refreshSession } = useAuth();
  const [searchParams] = useSearchParams();
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: searchParams.get("token") ?? "" },
  });

  const submit = handleSubmit(async ({ token, password }) => {
    setFormError("");
    try {
      await resetPassword(token, password);
      await refreshSession();
      setSuccess(true);
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <AuthLayout>
      <p className="eyebrow text-emerald-800">Secure your account</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">
        Set a new password
      </h1>
      {success ? (
        <div className="mt-5 space-y-4">
          <FormAlert success>
            Password reset successfully. Your existing sessions have been
            revoked.
          </FormAlert>
          <Button
            className="w-full"
            onClick={() => navigate("/login", { replace: true })}
            size="lg"
            type="button"
          >
            Continue to sign in
          </Button>
        </div>
      ) : (
        <form className="mt-7 space-y-5" noValidate onSubmit={submit}>
          <TextField
            autoComplete="one-time-code"
            error={errors.token?.message}
            id="token"
            label="Reset token"
            {...register("token")}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.password?.message}
            id="password"
            label="New password"
            {...register("password")}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            id="confirm-password"
            label="Confirm new password"
            {...register("confirmPassword")}
          />
          <FormAlert>{formError}</FormAlert>
          <SubmitButton pending={isSubmitting}>Reset password</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);
  const email =
    (location.state as { email?: string } | null)?.email ??
    searchParams.get("email") ??
    "";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { token: searchParams.get("token") ?? "" },
  });

  const submit = handleSubmit(async ({ token }) => {
    setFormError("");
    try {
      await verifyEmail(token);
      setSuccess(true);
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  });

  return (
    <AuthLayout>
      <p className="eyebrow text-emerald-800">Email verification</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">
        Verify your email
      </h1>
      {success ? (
        <div className="mt-5 space-y-4">
          <FormAlert success>
            Your account has been successfully verified!
          </FormAlert>
          <p className="text-sm leading-6 text-ink-soft">
            Your DealFlow registration is complete. You can now sign in to
            access your account.
          </p>
          <Button asChild className="w-full" size="lg" variant="accent">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Confirm your email address to complete registration and unlock your
            DealFlow account. We sent a verification link to:
          </p>
          {email && (
            <p className="mt-2 break-all text-sm font-semibold text-navy-950">
              {email}
            </p>
          )}
          <form className="mt-7 space-y-5" noValidate onSubmit={submit}>
            <TextField
              autoComplete="one-time-code"
              error={errors.token?.message}
              id="token"
              label="Verification token"
              {...register("token")}
            />
            <FormAlert>{formError}</FormAlert>
            <SubmitButton pending={isSubmitting}>Verify email</SubmitButton>
          </form>
          {email && (
            <div className="mt-4 space-y-2 text-center">
              <button
                className="text-sm font-semibold text-emerald-800 hover:underline disabled:opacity-60"
                disabled={resending}
                onClick={async () => {
                  setResending(true);
                  setResendMessage("");
                  try {
                    const result = await resendEmailVerification(email);
                    setResendMessage(result.message);
                  } catch (error) {
                    setFormError(toApiError(error).message);
                  } finally {
                    setResending(false);
                  }
                }}
                type="button"
              >
                {resending ? "Sending…" : "Resend verification email"}
              </button>
              <FormAlert success>{resendMessage}</FormAlert>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  );
}
