import axios from "axios";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const apiBaseUrl = (
  configuredBaseUrl || "http://localhost:3000/api"
).replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

let csrfToken: string | undefined;

/** Keep the later authentication flow's CSRF token in memory only. */
export function setCsrfToken(token: string | undefined) {
  csrfToken = token;
}

export function hasCsrfToken() {
  return Boolean(csrfToken);
}

apiClient.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (
    csrfToken &&
    method &&
    ["post", "put", "patch", "delete"].includes(method)
  ) {
    config.headers.set("X-CSRF-Token", csrfToken);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.error?.code;
    if (status === 401 || code === "CSRF_VALIDATION_FAILED") {
      setCsrfToken(undefined);
      if (status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("dealflow:session-expired"));
      }
    }
    return Promise.reject(error);
  },
);
