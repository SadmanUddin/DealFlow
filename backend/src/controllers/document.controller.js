import {
  deleteConversationDocument as deleteService,
  getConversationDocumentDownload,
  listConversationDocuments,
  uploadConversationDocument,
} from '#services/document.service.js';
import {
  documentListQuerySchema,
  documentParamsSchema,
  sanitizeFilename,
} from '#validations/document.validation.js';

export const uploadDocument = async (req, res) => {
  const { conversationId } = documentParamsSchema.parse(req.params);
  res
    .status(201)
    .json(await uploadConversationDocument(req, conversationId, req.user.id));
};
export const listDocuments = async (req, res) => {
  const { conversationId } = documentParamsSchema.parse(req.params);
  const query = documentListQuerySchema.parse(req.query);
  res
    .status(200)
    .json(await listConversationDocuments(conversationId, req.user.id, query));
};
export const downloadDocument = async (req, res, next) => {
  const { conversationId, documentId } = documentParamsSchema.parse(req.params);
  const { row, stream } = await getConversationDocumentDownload(
    conversationId,
    documentId,
    req.user.id
  );
  const filename = sanitizeFilename(row.original_filename);
  const asciiFilename = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  res.set({
    'Content-Type': row.mime_type,
    'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(row.size_bytes),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  stream.on('error', next);
  stream.pipe(res);
};
export const deleteDocument = async (req, res) => {
  const { conversationId, documentId } = documentParamsSchema.parse(req.params);
  await deleteService(conversationId, documentId, req.user.id);
  res.status(204).end();
};
