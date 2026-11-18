import { addFavorite as add, listFavorites as list, removeFavorite as remove } from '#services/favorite.service.js';
import { favoriteListingIdSchema } from '#validations/phase6.validation.js';
import { paginationSchema } from '#validations/listing.validation.js';

export const listFavorites = async (req, res) => res.status(200).json(await list(req.user.id, paginationSchema.parse(req.query)));
export const addFavorite = async (req, res) => {
  const { listingId } = favoriteListingIdSchema.parse(req.params);
  const result = await add(req.user.id, listingId);
  res.status(result.created ? 201 : 200).json({ favorite: { listingId }, created: result.created });
};
export const removeFavorite = async (req, res) => {
  const { listingId } = favoriteListingIdSchema.parse(req.params);
  const result = await remove(req.user.id, listingId);
  res.status(200).json(result);
};
