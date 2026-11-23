import {
  createChecklistSchema,
  createDocumentRequestSchema,
  diligenceDealParams,
  diligenceQuery,
  diligenceRecordParams,
  updateChecklistSchema,
  updateDocumentRequestSchema,
} from '#validations/diligence.validation.js';
import {
  createChecklistItem,
  createDocumentRequest,
  getDiligence,
  updateChecklistItem,
  updateDocumentRequest,
} from '#services/diligence.service.js';

export const diligence = async (req, res) => {
  const { id } = diligenceDealParams.parse(req.params);
  res.json(
    await getDiligence(id, req.user.id, diligenceQuery.parse(req.query))
  );
};

export const addChecklistItem = async (req, res) => {
  const { id } = diligenceDealParams.parse(req.params);
  res
    .status(201)
    .json(
      await createChecklistItem(
        id,
        req.user.id,
        createChecklistSchema.parse(req.body)
      )
    );
};

export const editChecklistItem = async (req, res) => {
  const { id, recordId } = diligenceRecordParams.parse(req.params);
  res.json(
    await updateChecklistItem(
      id,
      req.user.id,
      recordId,
      updateChecklistSchema.parse(req.body)
    )
  );
};

export const addDocumentRequest = async (req, res) => {
  const { id } = diligenceDealParams.parse(req.params);
  res
    .status(201)
    .json(
      await createDocumentRequest(
        id,
        req.user.id,
        createDocumentRequestSchema.parse(req.body)
      )
    );
};

export const actOnDocumentRequest = async (req, res) => {
  const { id, recordId } = diligenceRecordParams.parse(req.params);
  res.json(
    await updateDocumentRequest(
      id,
      req.user.id,
      recordId,
      updateDocumentRequestSchema.parse(req.body)
    )
  );
};
