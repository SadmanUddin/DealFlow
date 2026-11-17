import express from 'express';
import { deleteDocument, downloadDocument, listDocuments, uploadDocument } from '#controllers/document.controller.js';
import { requireAuthentication, requireCsrf } from '#middleware/auth.middleware.js';

const router = express.Router({ mergeParams: true });
router.use(requireAuthentication);
router.post('/', requireCsrf, uploadDocument);
router.get('/', listDocuments);
router.get('/:documentId/download', downloadDocument);
router.delete('/:documentId', requireCsrf, deleteDocument);
export default router;
