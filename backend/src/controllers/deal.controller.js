import {
  createDeal,
  createOffer,
  getDeal,
  getDealDocumentDownload,
  linkDealDocument,
  listDealActivities,
  listDealDocuments,
  listDeals,
  listOffers,
  respondToOffer,
  updateDealStatus,
  withdrawOffer,
} from '#services/deal.service.js';
import {
  createDealSchema,
  createOfferSchema,
  dealDocumentDownloadParamsSchema,
  dealIdSchema,
  dealListSchema,
  dealOfferIdSchema,
  dealStatusSchema,
  linkDealDocumentSchema,
  respondOfferSchema,
} from '#validations/deal.validation.js';
import { sanitizeFilename } from '#validations/document.validation.js';

export const create = async (req, res) => {
  const { listingId } = createDealSchema.parse(req.body);
  const result = await createDeal(req.user.id, listingId);
  res.status(result.created ? 201 : 200).json(result);
};
export const list = async (req, res) =>
  res
    .status(200)
    .json(await listDeals(req.user.id, dealListSchema.parse(req.query)));
export const detail = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res
    .status(200)
    .json({ deal: await getDeal(id, req.user.id, req.user.role === 'admin') });
};
export const changeStatus = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  const { status } = dealStatusSchema.parse(req.body);
  res.status(200).json({
    deal: await updateDealStatus(id, req.user.id, req.user.role, status),
  });
};
export const offer = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res.status(201).json({
    offer: await createOffer(
      id,
      req.user.id,
      createOfferSchema.parse(req.body)
    ),
  });
};
export const offers = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res
    .status(200)
    .json(await listOffers(id, req.user.id, dealListSchema.parse(req.query)));
};
export const respond = async (req, res) => {
  const { id, offerId } = dealOfferIdSchema.parse(req.params);
  const { action } = respondOfferSchema.parse(req.body);
  res
    .status(200)
    .json({ offer: await respondToOffer(id, offerId, req.user.id, action) });
};
export const withdraw = async (req, res) => {
  const { id, offerId } = dealOfferIdSchema.parse(req.params);
  res
    .status(200)
    .json({ offer: await withdrawOffer(id, offerId, req.user.id) });
};
export const history = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res
    .status(200)
    .json(
      await listDealActivities(
        id,
        req.user.id,
        req.user.role === 'admin',
        dealListSchema.parse(req.query)
      )
    );
};
export const documents = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res
    .status(200)
    .json(
      await listDealDocuments(id, req.user.id, dealListSchema.parse(req.query))
    );
};
export const linkDocument = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  const { conversationDocumentId } = linkDealDocumentSchema.parse(req.body);
  res.status(201).json({
    document: await linkDealDocument(id, req.user.id, conversationDocumentId),
  });
};
export const downloadDocument = async (req, res, next) => {
  const { id, documentId } = dealDocumentDownloadParamsSchema.parse(
    req.params
  );
  const { row, stream } = await getDealDocumentDownload(
    id,
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
