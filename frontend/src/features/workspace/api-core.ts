import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client";

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type PageParams = { page?: number; limit?: number };

export async function getValidated<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const { data } = await apiClient.get<unknown>(path, { params });
  return parseValidated(schema, data);
}

export async function postValidated<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
) {
  const { data } = await apiClient.post<unknown>(path, body);
  return parseValidated(schema, data);
}

export async function patchValidated<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
) {
  const { data } = await apiClient.patch<unknown>(path, body);
  return parseValidated(schema, data);
}

export async function deleteValidated<T>(path: string, schema: z.ZodType<T>) {
  const { data } = await apiClient.delete<unknown>(path);
  return parseValidated(schema, data);
}

export function parseValidated<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError("DealFlow returned an unexpected response.", {
      status: 502,
      code: "INVALID_API_RESPONSE",
    });
  }
  return result.data;
}
