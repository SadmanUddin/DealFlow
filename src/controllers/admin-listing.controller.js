import {
  getAdminListings as getAdminListingsService,
  moderateListing as moderateListingService,
} from '#services/listing.service.js';
import {
  listingIdSchema,
  adminListingQuerySchema,
  moderationSchema,
} from '#validations/listing.validation.js';

export const getAdminListings = async (req, res) => {
  const query = adminListingQuerySchema.parse(req.query);
  res.status(200).json(await getAdminListingsService(query));
};

export const moderateListing = async (req, res) => {
  const { id } = listingIdSchema.parse(req.params);
  const input = moderationSchema.parse(req.body);
  res.status(200).json({ listing: await moderateListingService(id, input) });
};
