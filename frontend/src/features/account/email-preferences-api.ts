import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { patchValidated } from "@/features/workspace/api-core";

const emailPreferencesSchema = z.object({
  listingStatus: z.boolean(),
  listingPrice: z.boolean(),
  listingDetails: z.boolean(),
  dealUpdates: z.boolean(),
});
export type EmailPreferences = z.infer<typeof emailPreferencesSchema>;
const preferencesResponseSchema = z.object({
  preferences: emailPreferencesSchema.extend({
    user_id: z.number().optional(),
    updatedAt: z.string().or(z.date()).optional(),
  }),
});
export const getEmailPreferences = () =>
  apiClient
    .get<unknown>("/notifications/preferences/email")
    .then(({ data }) => preferencesResponseSchema.parse(data).preferences);
export const updateEmailPreferences = (preferences: EmailPreferences) =>
  patchValidated(
    "/notifications/preferences/email",
    preferences,
    preferencesResponseSchema,
  ).then((result) => result.preferences);
