import { z } from "zod";
import {
  getValidated,
  patchValidated,
  postValidated,
} from "@/features/workspace/api-core";

export const categories = [
  "financial",
  "legal",
  "operational",
  "commercial",
  "technology",
  "other",
] as const;
export const taskStatuses = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
] as const;
export const assignments = ["buyer", "seller"] as const;
const id = z.number().int().positive();
const count = z.number().int().nonnegative();
const common = {
  id,
  title: z.string(),
  description: z.string(),
  due_date: z.string().nullable(),
  revision: count,
  created_at: z.string(),
  updated_at: z.string(),
};
const taskSchema = z.object({
  ...common,
  assigned_to: z.enum(assignments),
  category: z.enum(categories),
  status: z.enum(taskStatuses),
  created_by: id,
  completed_at: z.string().nullable(),
  overdue: z.boolean(),
});
const requestSchema = z.object({
  ...common,
  status: z.enum([
    "requested",
    "submitted",
    "under_review",
    "accepted",
    "changes_requested",
  ]),
  requested_by: id,
  responsible_id: id,
  document_id: id.nullable(),
  document_filename: z.string().nullable(),
  reviewed_by: id.nullable(),
  reviewed_at: z.string().nullable(),
  feedback: z.string().nullable(),
});
const diligenceSchema = z.object({
  checklist: z.array(taskSchema),
  requests: z.array(requestSchema),
  checklistTotal: count,
  requestTotal: count,
  pageSize: id,
  progress: z.object({
    total: count,
    completed: count,
    pending: count,
    inProgress: count,
    blocked: count,
    overdue: count,
    outstandingRequests: count,
  }),
  startedAt: z.string().nullable(),
  firstDocumentAcceptedAt: z.string().nullable(),
});
export type Diligence = z.infer<typeof diligenceSchema>;
export type ChecklistItem = z.infer<typeof taskSchema>;
export type DocumentRequest = z.infer<typeof requestSchema>;
export type DiligenceFilters = {
  page: number;
  requestPage: number;
  category?: ChecklistItem["category"];
  status?: ChecklistItem["status"];
  assignment?: "mine" | "other";
};
export const initialDiligenceFilters: DiligenceFilters = {
  page: 1,
  requestPage: 1,
};
export const diligenceKey = (dealId: number) =>
  ["deals", dealId, "diligence"] as const;
export type DiligenceFields = {
  title: string;
  description: string;
  dueDate: string | null;
};
export type ChecklistFields = DiligenceFields & {
  assignedTo: ChecklistItem["assigned_to"];
  category: ChecklistItem["category"];
};
export type RequestAction = { revision: number } & (
  | { action: "submit"; documentId: number }
  | { action: "review" | "accept" | "request_changes"; feedback?: string }
);

const path = (dealId: number) => `/deals/${dealId}/diligence`;
const recordResponse = z.object({ id });
export const getDiligence = (dealId: number, filters: DiligenceFilters) =>
  getValidated(path(dealId), diligenceSchema, filters);
export const createChecklistItem = (
  dealId: number,
  input: ChecklistFields & { creationKey: string },
) => postValidated(path(dealId) + "/checklist", input, recordResponse);
export const updateChecklistItem = (
  dealId: number,
  itemId: number,
  input: Partial<ChecklistFields & { status: ChecklistItem["status"] }> & {
    revision: number;
  },
) =>
  patchValidated(path(dealId) + "/checklist/" + itemId, input, recordResponse);
export const createDocumentRequest = (
  dealId: number,
  input: DiligenceFields & { creationKey: string },
) => postValidated(path(dealId) + "/requests", input, recordResponse);
export const updateDocumentRequest = (
  dealId: number,
  requestId: number,
  input: RequestAction,
) =>
  patchValidated(
    path(dealId) + "/requests/" + requestId,
    input,
    recordResponse,
  );
