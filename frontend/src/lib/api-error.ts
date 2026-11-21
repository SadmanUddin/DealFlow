import axios from "axios";

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: ApiErrorPayload & {
      status?: number;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function getRetryAfterSeconds(headers: unknown) {
  if (!headers || typeof headers !== "object") return undefined;
  const candidate = headers as {
    get?: (name: string) => unknown;
    [key: string]: unknown;
  };
  const value =
    candidate.get?.("retry-after") ??
    candidate["retry-after"] ??
    candidate["Retry-After"];
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const raw = String(value).trim();
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!axios.isAxiosError(error)) {
    return new ApiError("An unexpected error occurred. Please try again.");
  }

  const response = error.response;
  const payload = response?.data?.error as ApiErrorPayload | undefined;
  const retryAfterSeconds = getRetryAfterSeconds(response?.headers);
  return new ApiError(
    payload?.message ?? error.message ?? "The request could not be completed.",
    {
      status: response?.status,
      code: payload?.code,
      details: payload?.details,
      retryAfterSeconds,
    },
  );
}
