import { ApiError, toApiError } from "@/lib/api-error";
import { apiClient, hasCsrfToken, setCsrfToken } from "@/lib/api-client";
import type {
  AuthResponse,
  AuthUser,
  MessageResponse,
  SignInInput,
  SignUpInput,
  UserProfile,
} from "./types";

export const authQueryKeys = {
  session: ["auth", "session"] as const,
  profile: ["auth", "profile"] as const,
};

type UserResponse<T> = { user: T };
type CsrfResponse = { csrfToken: string };

let csrfRequest: Promise<string> | null = null;
function fetchCsrfToken(): Promise<string> {
  if (!csrfRequest) {
    csrfRequest = apiClient
      .get<CsrfResponse>("/auth/csrf")
      .then(({ data }) => {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      })
      .finally(() => {
        csrfRequest = null;
      });
  }
  return csrfRequest;
}

export async function withCsrfRetry<T>(operation: () => Promise<T>): Promise<T> {
  if (!hasCsrfToken()) await fetchCsrfToken();
  try {
    return await operation();
  } catch (error) {
    if (toApiError(error).code !== "CSRF_VALIDATION_FAILED") throw error;
    setCsrfToken(undefined);
    await fetchCsrfToken();
    return operation();
  }
}

let authTransition = Promise.resolve();
function serializeAuthTransition<T>(operation: () => Promise<T>): Promise<T> {
  const result = authTransition.then(operation, operation);
  authTransition = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readSession(): Promise<AuthUser | null> {
  try {
    const { data } = await apiClient.get<UserResponse<AuthUser>>("/auth/me");
    if (!hasCsrfToken()) await fetchCsrfToken();
    return data.user;
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status === 401) {
      setCsrfToken(undefined);
      return null;
    }
    throw error;
  }
}

let sessionRestoreRequest: Promise<AuthUser | null> | null = null;
export function restoreSession(): Promise<AuthUser | null> {
  if (!sessionRestoreRequest) {
    sessionRestoreRequest = readSession().finally(() => {
      sessionRestoreRequest = null;
    });
  }
  return sessionRestoreRequest;
}

export function signIn(input: SignInInput): Promise<AuthUser> {
  return serializeAuthTransition(async () => {
    const { data } = await apiClient.post<AuthResponse>("/auth/sign-in", input);
    setCsrfToken(data.csrfToken);
    return data.user;
  });
}

export function signUp(input: SignUpInput): Promise<RegistrationResponse> {
  return serializeAuthTransition(async () => {
    const { data } = await apiClient.post<RegistrationResponse>(
      "/auth/sign-up",
      input,
    );
    return data;
  });
}

export type RegistrationResponse = { message: string; email: string };

export function signOut(): Promise<MessageResponse> {
  return serializeAuthTransition(() =>
    withCsrfRetry(async () => {
      const { data } = await apiClient.post<MessageResponse>("/auth/sign-out");
      setCsrfToken(undefined);
      return data;
    }),
  );
}

export async function requestPasswordReset(email: string) {
  const { data } = await apiClient.post<MessageResponse>(
    "/auth/forgot-password",
    { email },
  );
  return data;
}

export async function resetPassword(token: string, password: string) {
  const { data } = await apiClient.post<MessageResponse>(
    "/auth/reset-password",
    { token, password },
  );
  return data;
}

export async function verifyEmail(token: string) {
  const { data } = await apiClient.post<MessageResponse>("/auth/verify-email", {
    token,
  });
  return data;
}

export async function resendEmailVerification(email: string) {
  const { data } = await apiClient.post<MessageResponse>(
    "/auth/resend-verification",
    { email },
  );
  return data;
}

export async function getProfile(): Promise<UserProfile> {
  const { data } =
    await apiClient.get<UserResponse<UserProfile>>("/users/profile");
  return data.user;
}

export async function updateProfile(name: string): Promise<UserProfile> {
  return withCsrfRetry(async () => {
    const { data } = await apiClient.patch<UserResponse<UserProfile>>(
      "/users/profile",
      { name },
    );
    return data.user;
  });
}

export const deactivateAccount = (password: string) => withCsrfRetry(() => apiClient.patch<MessageResponse>("/users/deactivate", { password }).then(({ data }) => data));

export function normalizeAuthError(error: unknown): ApiError {
  return toApiError(error);
}
