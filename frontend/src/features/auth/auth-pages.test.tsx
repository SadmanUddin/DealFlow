import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./AuthPages";
import { RequireAuth } from "./RouteGuards";
import { AccountPage } from "@/features/account/AccountPage";
import { SiteHeader } from "@/components/shared/SiteHeader";
import type { AuthResponse, AuthUser, UserProfile } from "./types";

const apiMocks = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, ...apiMocks };
});

const buyer: AuthUser = {
  id: 21,
  name: "Alex Buyer",
  email: "alex@example.com",
  role: "buyer",
  emailVerified: true,
};

const profile: UserProfile = {
  ...buyer,
  name: "Alex Buyer",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderApp(element: React.ReactNode, initialPath = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{element}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMocks.restoreSession.mockResolvedValue(null);
  apiMocks.signIn.mockReset();
  apiMocks.signUp.mockReset();
  apiMocks.signOut.mockReset();
  apiMocks.getProfile.mockReset();
  apiMocks.updateProfile.mockReset();
  apiMocks.requestPasswordReset.mockReset();
  apiMocks.resetPassword.mockReset();
  apiMocks.verifyEmail.mockReset();
});

describe("authentication pages", () => {
  it("validates login fields and shows or hides the password", async () => {
    const user = userEvent.setup();
    renderApp(<LoginPage />, "/login");
    await screen.findByRole("heading", { name: "Sign in to DealFlow" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email address"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "long-secure-password");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("submits valid login and shows backend authentication errors", async () => {
    const user = userEvent.setup();
    apiMocks.signIn.mockResolvedValueOnce(buyer);
    renderApp(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/account" element={<p>Account destination</p>} />
      </Routes>,
      "/login",
    );
    await user.type(
      await screen.findByLabelText("Email address"),
      "alex@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "long-secure-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Account destination")).toBeInTheDocument();
    expect(apiMocks.signIn.mock.calls[0]?.[0]).toEqual({
      email: "alex@example.com",
      password: "long-secure-password",
    });

    apiMocks.restoreSession.mockResolvedValueOnce(null);
    apiMocks.signIn.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect",
          },
        },
      },
      isAxiosError: true,
    });
    renderApp(<LoginPage />, "/login");
    await user.type(
      await screen.findByLabelText("Email address"),
      "alex@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "long-secure-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Email or password is incorrect",
    );
  });

  it("validates registration confirmation and registers with the backend role contract", async () => {
    const user = userEvent.setup();
    const response: AuthResponse = {
      user: { ...buyer, emailVerified: false },
      csrfToken: "csrf-value",
      message: "Account created. Email verification is pending.",
    };
    apiMocks.signUp.mockResolvedValueOnce(response);
    renderApp(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account" element={<p>Registration complete</p>} />
      </Routes>,
      "/register",
    );
    await user.type(await screen.findByLabelText("Full name"), "Alex Buyer");
    await user.type(screen.getByLabelText("Email address"), "alex@example.com");
    await user.selectOptions(
      screen.getByLabelText("I’m joining as a"),
      "seller",
    );
    await user.type(screen.getByLabelText("Password"), "long-secure-password");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "different-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Passwords do not match"),
    ).toBeInTheDocument();
    expect(apiMocks.signUp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(
      screen.getByLabelText("Confirm password"),
      "long-secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Registration complete"),
    ).toBeInTheDocument();
    expect(apiMocks.signUp.mock.calls[0]?.[0]).toEqual({
      name: "Alex Buyer",
      email: "alex@example.com",
      password: "long-secure-password",
      role: "seller",
    });
  });
});

describe("session and route access", () => {
  it("restores a valid cookie session before rendering protected content", async () => {
    apiMocks.restoreSession.mockResolvedValueOnce(buyer);
    renderApp(
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path="/private"
          element={
            <RequireAuth>
              <p>Protected buyer content</p>
            </RequireAuth>
          }
        />
      </Routes>,
      "/private",
    );
    expect(
      await screen.findByText("Protected buyer content"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
    expect(apiMocks.restoreSession).toHaveBeenCalledOnce();
  });

  it("keeps session restoration to one request under React StrictMode", async () => {
    apiMocks.restoreSession.mockResolvedValueOnce(buyer);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={["/private"]}>
              <Routes>
                <Route path="/login" element={<p>Login page</p>} />
                <Route
                  path="/private"
                  element={
                    <RequireAuth>
                      <p>StrictMode protected content</p>
                    </RequireAuth>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(
      await screen.findByText("StrictMode protected content"),
    ).toBeInTheDocument();
    expect(apiMocks.restoreSession).toHaveBeenCalledOnce();
  });

  it("redirects unauthenticated users to login and preserves destination", async () => {
    renderApp(
      <Routes>
        <Route path="/login" element={<p>Login destination</p>} />
        <Route
          path="/private"
          element={
            <RequireAuth>
              <p>Private area</p>
            </RequireAuth>
          }
        />
      </Routes>,
      "/private?tab=profile",
    );
    expect(await screen.findByText("Login destination")).toBeInTheDocument();
  });

  it("handles an expired session as signed out without exposing a token", async () => {
    apiMocks.restoreSession.mockResolvedValueOnce(null);
    renderApp(
      <Routes>
        <Route path="/login" element={<p>Sign-in required</p>} />
        <Route
          path="/private"
          element={
            <RequireAuth>
              <p>Private area</p>
            </RequireAuth>
          }
        />
      </Routes>,
      "/private",
    );
    expect(await screen.findByText("Sign-in required")).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows a calm rate-limit state without automatically retrying session restore", async () => {
    apiMocks.restoreSession.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          error: { code: "RATE_LIMITED", message: "Too many requests" },
        },
      },
    });
    renderApp(
      <Routes>
        <Route path="/login" element={<p>Login route</p>} />
        <Route
          path="/private"
          element={
            <RequireAuth>
              <p>Private route</p>
            </RequireAuth>
          }
        />
      </Routes>,
      "/private",
    );

    expect(
      await screen.findByText(/Too many session checks were made/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(apiMocks.restoreSession).toHaveBeenCalledOnce();
  });

  it("blocks users whose role does not match a protected route", async () => {
    apiMocks.restoreSession.mockResolvedValueOnce(buyer);
    renderApp(
      <Routes>
        <Route path="/unauthorized" element={<p>Role access denied</p>} />
        <Route
          path="/admin"
          element={
            <RequireAuth roles={["admin"]}>
              <p>Admin tools</p>
            </RequireAuth>
          }
        />
      </Routes>,
      "/admin",
    );
    expect(await screen.findByText("Role access denied")).toBeInTheDocument();
    expect(screen.queryByText("Admin tools")).not.toBeInTheDocument();
  });

  it("logs out and clears the authenticated navigation state", async () => {
    const user = userEvent.setup();
    apiMocks.restoreSession.mockResolvedValueOnce(buyer);
    apiMocks.signOut.mockResolvedValueOnce({ message: "Signed out" });
    renderApp(<SiteHeader />, "/");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("link", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(apiMocks.signOut).toHaveBeenCalledOnce();
  });

  it("keeps a confirmed session visible when logout fails with a server error", async () => {
    const user = userEvent.setup();
    apiMocks.restoreSession
      .mockResolvedValueOnce(buyer)
      .mockResolvedValueOnce(buyer);
    apiMocks.signOut.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 503,
        data: {
          error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" },
        },
      },
    });
    renderApp(<SiteHeader />, "/");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out could not be confirmed",
    );
    expect(
      screen.getByRole("link", { name: "My account" }),
    ).toBeInTheDocument();
  });
});

describe("profile updates", () => {
  it("loads the backend profile and updates the permitted name field", async () => {
    const user = userEvent.setup();
    apiMocks.restoreSession.mockResolvedValueOnce(buyer);
    apiMocks.getProfile.mockResolvedValueOnce(profile);
    apiMocks.updateProfile.mockImplementationOnce(async (name) => ({
      ...profile,
      name,
    }));
    renderApp(<AccountPage />, "/account");
    const nameInput = await screen.findByLabelText("Full name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alex Seller");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your profile has been updated.",
    );
    expect(apiMocks.updateProfile).toHaveBeenCalledWith("Alex Seller");
  });
});

describe("backend-supported recovery and verification forms", () => {
  it("shows the backend response without claiming a reset email was sent", async () => {
    const user = userEvent.setup();
    apiMocks.requestPasswordReset.mockResolvedValueOnce({
      message: "Password reset request received.",
    });
    renderApp(<ForgotPasswordPage />, "/forgot-password");
    await user.type(
      await screen.findByLabelText("Email address"),
      "alex@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Request reset" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "does not deliver password reset emails",
    );
    expect(apiMocks.requestPasswordReset.mock.calls[0]?.[0]).toBe(
      "alex@example.com",
    );
  });

  it("handles an expired password-reset token from the backend", async () => {
    const user = userEvent.setup();
    apiMocks.resetPassword.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message: "Token is invalid, expired, or already used",
          },
        },
      },
    });
    renderApp(
      <ResetPasswordPage />,
      "/reset-password?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    await user.type(
      await screen.findByLabelText("New password"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Token is invalid, expired, or already used",
    );
    expect(apiMocks.resetPassword.mock.calls[0]?.[0]).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("shows reset success and requires the user to sign in again", async () => {
    const user = userEvent.setup();
    apiMocks.resetPassword.mockResolvedValueOnce({
      message: "Password reset successfully",
    });
    apiMocks.restoreSession.mockResolvedValueOnce(null);
    renderApp(
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Sign in with your new password</p>} />
      </Routes>,
      "/reset-password?token=cccccccccccccccccccccccccccccccc",
    );
    await user.type(
      await screen.findByLabelText("New password"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(
      await screen.findByRole("button", { name: "Continue to sign in" }),
    );
    expect(
      await screen.findByText("Sign in with your new password"),
    ).toBeInTheDocument();
  });

  it("submits an email-verification token and displays backend success", async () => {
    const user = userEvent.setup();
    apiMocks.verifyEmail.mockResolvedValueOnce({ message: "Email verified" });
    renderApp(
      <VerifyEmailPage />,
      "/verify-email?token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    await user.click(
      await screen.findByRole("button", { name: "Verify email" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Email verified.",
    );
    expect(apiMocks.verifyEmail.mock.calls[0]?.[0]).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });

  it("shows expired verification token errors from the backend", async () => {
    const user = userEvent.setup();
    apiMocks.verifyEmail.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message: "Token is invalid, expired, or already used",
          },
        },
      },
    });
    renderApp(
      <VerifyEmailPage />,
      "/verify-email?token=dddddddddddddddddddddddddddddddd",
    );
    await user.click(
      await screen.findByRole("button", { name: "Verify email" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Token is invalid, expired, or already used",
    );
  });
});
