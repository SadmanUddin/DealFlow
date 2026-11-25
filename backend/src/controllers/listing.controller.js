import {
  archiveListing as archiveListingService,
  createListing as createListingService,
  deleteDraftListing,
  getMyListing as getMyListingService,
  getMyListings as getMyListingsService,
  getPublicListings as getPublicListingsService,
  getPublishedListing as getPublishedListingService,
  isSellerEmailVerified,
  submitListing as submitListingService,
  updateListing as updateListingService,
} from '#services/listing.service.js';
import { AppError } from '#utils/app-error.js';
import {
  getListingImage,
  removeListingImage,
  uploadListingImage,
} from '#services/listing-image.service.js';
import {
  createListingSchema,
  emptyBodySchema,
  listingIdSchema,
  paginationSchema,
  publicListingQuerySchema,
  updateListingSchema,
} from '#validations/listing.validation.js';

const listingId = req => listingIdSchema.parse(req.params).id;

export const uploadListingImageController = async (req, res) => {
  res
    .status(200)
    .json(await uploadListingImage(req, listingId(req), req.user.id));
};

export const removeListingImageController = async (req, res) => {
  res.status(200).json(await removeListingImage(listingId(req), req.user.id));
};

export const getListingImageController = async (req, res) => {
  const { loadStream, mimeType, isPublic, etag } = await getListingImage(
    listingId(req),
    req.user?.id
  );
  const headers = {
    'Content-Type': mimeType,
    'Cache-Control': isPublic ? 'public, no-cache' : 'private, no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  };
  if (etag) {
    res.set('ETag', etag);
    if (req.fresh) {
      res.set(headers).status(304).end();
      return;
    }
    // Keep the validator off error responses if the object fetch fails.
    res.removeHeader('ETag');
  }
  const stream = await loadStream();
  res.set(headers);
  if (etag) res.set('ETag', etag);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.removeHeader('ETag');
      res.set('Cache-Control', 'private, no-store').status(502).end();
    } else res.destroy();
  });
  stream.pipe(res);
};

export const createListing = async (req, res) => {
  const input = createListingSchema.parse(req.body);
  const listing = await createListingService(req.user.id, input);
  res.status(201).json({ listing });
};

export const getMyListings = async (req, res) => {
  const query = paginationSchema.parse(req.query);
  res.status(200).json(await getMyListingsService(req.user.id, query));
};

export const getMyListing = async (req, res) => {
  res
    .set('Cache-Control', 'private, no-store')
    .status(200)
    .json({
      listing: await getMyListingService(req.user.id, listingId(req)),
    });
};

export const getPublicListings = async (req, res) => {
  const query = publicListingQuerySchema.parse(req.query);
  res.status(200).json(await getPublicListingsService(query));
};

export const getPublishedListing = async (req, res) => {
  res.vary('Cookie');
  if (req.user) res.set('Cache-Control', 'private, no-store');
  res.status(200).json({
    listing: await getPublishedListingService(
      listingId(req),
      req.user?.id ?? null
    ),
  });
};

export const updateListing = async (req, res) => {
  const input = updateListingSchema.parse(req.body);
  const listing = await updateListingService(
    req.user.id,
    listingId(req),
    input
  );
  res.status(200).json({ listing });
};

export const submitListing = async (req, res) => {
  emptyBodySchema.parse(req.body ?? {});
  const id = listingId(req);
  if (!(await isSellerEmailVerified(req.user.id))) {
    throw new AppError(
      403,
      'EMAIL_VERIFICATION_REQUIRED',
      'Verify your email before submitting a listing'
    );
  }
  res
    .status(200)
    .json({ listing: await submitListingService(req.user.id, id) });
};

export const archiveListing = async (req, res) => {
  emptyBodySchema.parse(req.body ?? {});
  res.status(200).json({
    listing: await archiveListingService(req.user.id, listingId(req)),
  });
};

export const deleteListing = async (req, res) => {
  emptyBodySchema.parse(req.body ?? {});
  await deleteDraftListing(req.user.id, listingId(req));
  res.status(200).json({ message: 'Draft listing deleted' });
};
