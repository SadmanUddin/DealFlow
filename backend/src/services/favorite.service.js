import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { businessListings } from '#models/listing.model.js';
import { favorites } from '#models/phase6.model.js';
import { AppError } from '#utils/app-error.js';

export const listFavorites = async (userId, { page, limit }) => {
  const where = and(
    eq(favorites.user_id, userId),
    eq(businessListings.status, 'published')
  );
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: favorites.id,
        createdAt: favorites.created_at,
        listingId: businessListings.id,
        title: businessListings.title,
        description: businessListings.description,
        industry: businessListings.industry,
        location: businessListings.location,
        askingPrice: businessListings.asking_price,
        currency: businessListings.currency,
        publishedAt: businessListings.published_at,
      })
      .from(favorites)
      .innerJoin(
        businessListings,
        eq(favorites.listing_id, businessListings.id)
      )
      .where(where)
      .orderBy(desc(favorites.created_at), desc(favorites.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(favorites)
      .innerJoin(
        businessListings,
        eq(favorites.listing_id, businessListings.id)
      )
      .where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return {
    favorites: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const addFavorite = async (userId, listingId) => {
  const [listing] = await db
    .select({ id: businessListings.id, sellerId: businessListings.seller_id })
    .from(businessListings)
    .where(
      and(
        eq(businessListings.id, listingId),
        eq(businessListings.status, 'published')
      )
    )
    .limit(1);
  if (!listing)
    throw new AppError(
      404,
      'LISTING_NOT_FOUND',
      'Eligible listing was not found'
    );
  if (listing.sellerId === userId)
    throw new AppError(
      403,
      'OWN_LISTING_FAVORITE',
      'You cannot favorite your own listing'
    );
  const [favorite] = await db
    .insert(favorites)
    .values({ user_id: userId, listing_id: listingId })
    .onConflictDoNothing({ target: [favorites.user_id, favorites.listing_id] })
    .returning({ id: favorites.id });
  if (favorite) return { created: true };
  return { created: false };
};

export const removeFavorite = async (userId, listingId) => {
  const [deleted] = await db
    .delete(favorites)
    .where(
      and(eq(favorites.user_id, userId), eq(favorites.listing_id, listingId))
    )
    .returning({ id: favorites.id });
  return { removed: Boolean(deleted) };
};
