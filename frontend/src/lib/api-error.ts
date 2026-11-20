import axios from 'axios';

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options: ApiErrorPayload & { status?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return new ApiError('An unexpected error occurred. Please try again.');
  }

  const response = error.response;
  const payload = response?.data?.error as ApiErrorPayload | undefined;
  return new ApiError(
    payload?.message ?? error.message ?? 'The request could not be completed.',
    {
      status: response?.status,
      code: payload?.code,
      details: payload?.details,
    },
  );
}
