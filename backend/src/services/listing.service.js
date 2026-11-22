import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '#config/database.js';
import { businessListings } from '#models/listing.model.js';
import { users } from '#models/user.model.js';
import { AppError } from '#utils/app-error.js';

const publicFields = {
  id: businessListings.id,
  title: businessListings.title,
  description: businessListings.description,
  industry: businessListings.industry,
  location: businessListings.location,
  website: businessListings.website,
  imageUrl: sql`CASE WHEN ${businessListings.image_key} IS NULL THEN NULL ELSE '/api/listings/' || ${businessListings.id}::text || '/image?v=' || floor(extract(epoch from ${businessListings.updated_at}) * 1000)::bigint::text END`,
  askingPrice: businessListings.asking_price,
  annualRevenue: businessListings.annual_revenue,
  ebitda: businessListings.ebitda,
  currency: businessListings.currency,
  publishedAt: businessListings.published_at,
  createdAt: businessListings.created_at,
};
const saleFields = {
  status: businessListings.status,
  soldAt: businessListings.sold_at,
  publicSalePrice: businessListings.public_sale_price,
  publicSaleCurrency: businessListings.public_sale_currency,
};
const publicStatuses = ['published', 'sold'];
const sellerFields = {
  ...publicFields,
  status: businessListings.status,
  soldAt: businessListings.sold_at,
  rejectionReason: businessListings.rejection_reason,
  updatedAt: businessListings.updated_at,
};
const adminFields = { ...sellerFields, sellerId: businessListings.seller_id };

const notFound = () =>
  new AppError(404, 'LISTING_NOT_FOUND', 'Business listing was not found');
const invalidTransition = message =>
  new AppError(409, 'INVALID_LISTING_STATUS', message);
const editableStatuses = ['draft', 'rejected', 'published'];

export const createListing = async (sellerId, input) => {
  const [listing] = await db
    .insert(businessListings)
    .values({ ...input, seller_id: sellerId, status: 'draft' })
    .returning(sellerFields);
  return listing;
};

export const getMyListings = async (sellerId, { page, limit }) => {
  const offset = (page - 1) * limit;
  const [rows, countRows] = await Promise.all([
    db
      .select(sellerFields)
      .from(businessListings)
      .where(eq(businessListings.seller_id, sellerId))
      .orderBy(desc(businessListings.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql`count(*)::int`,
        sold: sql`count(*) FILTER (WHERE ${businessListings.status} = 'sold')::int`,
      })
      .from(businessListings)
      .where(eq(businessListings.seller_id, sellerId)),
  ]);
  return {
    listings: rows,
    soldCount: countRows[0]?.sold ?? 0,
    pagination: pagination(page, limit, countRows[0]?.count ?? 0),
  };
};

export const getPublicListings = async ({
  page,
  limit,
  q,
  industry,
  location,
  minPrice,
  maxPrice,
  minRevenue,
  maxRevenue,
  minEbitda,
  maxEbitda,
  sort = 'newest',
  availability = 'available',
}) => {
  const filters = [
    availability === 'all'
      ? inArray(businessListings.status, publicStatuses)
      : eq(
        businessListings.status,
        availability === 'sold' ? 'sold' : 'published'
      ),
  ];
  if (q) {
    const keyword = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    filters.push(
      or(
        ilike(businessListings.title, keyword),
        ilike(businessListings.description, keyword)
      )
    );
  }
  if (industry) filters.push(ilike(businessListings.industry, `%${industry}%`));
  if (location) filters.push(ilike(businessListings.location, `%${location}%`));
  for (const [column, minimum, maximum] of [
    [businessListings.asking_price, minPrice, maxPrice],
    [businessListings.annual_revenue, minRevenue, maxRevenue],
    [businessListings.ebitda, minEbitda, maxEbitda],
  ]) {
    if (minimum !== undefined) filters.push(gte(column, minimum));
    if (maximum !== undefined) filters.push(lte(column, maximum));
  }
  const where = and(...filters);
  const listingDate =
    availability === 'available'
      ? businessListings.published_at
      : sql`coalesce(${businessListings.sold_at}, ${businessListings.published_at})`;
  const ordering = {
    newest: [desc(listingDate), desc(businessListings.id)],
    oldest: [asc(listingDate), asc(businessListings.id)],
    price_asc: [
      asc(businessListings.asking_price),
      desc(listingDate),
      desc(businessListings.id),
    ],
    price_desc: [
      desc(businessListings.asking_price),
      desc(listingDate),
      desc(businessListings.id),
    ],
  }[sort];
  const [rows, countRows] = await Promise.all([
    db
      .select({ ...publicFields, ...saleFields, sellerName: users.name })
      .from(businessListings)
      .innerJoin(users, eq(users.id, businessListings.seller_id))
      .where(where)
      .orderBy(...ordering)
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(businessListings)
      .where(where),
  ]);
  return {
    listings: rows,
    pagination: pagination(page, limit, countRows[0]?.count ?? 0),
  };
};

const pagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const getPublishedListing = async (id, viewerId = null) => {
  const viewerFavorite =
    viewerId === null
      ? undefined
      : sql`EXISTS (SELECT 1 FROM favorites WHERE favorites.listing_id = ${businessListings.id} AND favorites.user_id = ${viewerId})`;
  const [listing] = await db
    .select({
      ...publicFields,
      ...saleFields,
      sellerName: users.name,
      ...(viewerFavorite ? { isFavorite: viewerFavorite } : {}),
    })
    .from(businessListings)
    .innerJoin(users, eq(users.id, businessListings.seller_id))
    .where(
      and(
        eq(businessListings.id, id),
        inArray(businessListings.status, publicStatuses)
      )
    )
    .limit(1);
  if (!listing) throw notFound();
  return listing;
};

export const updateListing = async (sellerId, id, input) => {
  const [current] = await db
    .select({ status: businessListings.status })
    .from(businessListings)
    .where(
      and(eq(businessListings.id, id), eq(businessListings.seller_id, sellerId))
    )
    .limit(1);
  if (!current) throw notFound();
  if (!editableStatuses.includes(current.status))
    throw invalidTransition(
      'This listing cannot be edited in its current status'
    );
  const isPublished = current.status === 'published';
  const [listing] = await db
    .update(businessListings)
    .set({
      ...input,
      ...(isPublished ? { status: 'pending', published_at: null } : {}),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(businessListings.id, id),
        eq(businessListings.seller_id, sellerId),
        eq(businessListings.status, current.status)
      )
    )
    .returning(sellerFields);
  if (!listing)
    throw invalidTransition('Listing status changed; reload and try again');
  return listing;
};

export const submitListing = async (sellerId, id) => {
  const [listing] = await db
    .update(businessListings)
    .set({ status: 'pending', rejection_reason: null, updated_at: new Date() })
    .where(
      and(
        eq(businessListings.id, id),
        eq(businessListings.seller_id, sellerId),
        or(
          eq(businessListings.status, 'draft'),
          eq(businessListings.status, 'rejected')
        )
      )
    )
    .returning(sellerFields);
  if (listing) return listing;
  const [exists] = await db
    .select({ id: businessListings.id })
    .from(businessListings)
    .where(
      and(eq(businessListings.id, id), eq(businessListings.seller_id, sellerId))
    )
    .limit(1);
  if (!exists) throw notFound();
  throw invalidTransition('Only draft or rejected listings can be submitted');
};

export const archiveListing = async (sellerId, id) => {
  const [listing] = await db
    .update(businessListings)
    .set({ status: 'archived', updated_at: new Date() })
    .where(
      and(
        eq(businessListings.id, id),
        eq(businessListings.seller_id, sellerId),
        eq(businessListings.status, 'published')
      )
    )
    .returning(sellerFields);
  if (listing) return listing;
  const [exists] = await db
    .select({ id: businessListings.id })
    .from(businessListings)
    .where(
      and(eq(businessListings.id, id), eq(businessListings.seller_id, sellerId))
    )
    .limit(1);
  if (!exists) throw notFound();
  throw invalidTransition('Only published listings can be archived');
};

export const deleteDraftListing = async (sellerId, id) => {
  const [listing] = await db
    .delete(businessListings)
    .where(
      and(
        eq(businessListings.id, id),
        eq(businessListings.seller_id, sellerId),
        eq(businessListings.status, 'draft')
      )
    )
    .returning({ id: businessListings.id });
  if (listing) return;
  const [exists] = await db
    .select({ id: businessListings.id })
    .from(businessListings)
    .where(
      and(eq(businessListings.id, id), eq(businessListings.seller_id, sellerId))
    )
    .limit(1);
  if (!exists) throw notFound();
  throw invalidTransition('Only draft listings can be deleted');
};

export const getAdminListings = async ({ page, limit, status }) => {
  const where = status ? eq(businessListings.status, status) : undefined;
  const [rows, countRows] = await Promise.all([
    db
      .select(adminFields)
      .from(businessListings)
      .where(where)
      .orderBy(desc(businessListings.created_at))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(businessListings)
      .where(where),
  ]);
  return {
    listings: rows,
    pagination: pagination(page, limit, countRows[0]?.count ?? 0),
  };
};

export const moderateListing = async (id, { action, rejectionReason }) => {
  const approval = action === 'approve';
  const [listing] = await db
    .update(businessListings)
    .set({
      status: approval ? 'published' : 'rejected',
      published_at: approval ? new Date() : null,
      rejection_reason: approval ? null : rejectionReason,
      updated_at: new Date(),
    })
    .where(
      and(eq(businessListings.id, id), eq(businessListings.status, 'pending'))
    )
    .returning(adminFields);
  if (listing) return listing;
  const [exists] = await db
    .select({ id: businessListings.id })
    .from(businessListings)
    .where(eq(businessListings.id, id))
    .limit(1);
  if (!exists) throw notFound();
  throw invalidTransition('Only pending listings can be moderated');
};

export const isSellerEmailVerified = async sellerId => {
  const [user] = await db
    .select({ emailVerified: users.email_verified })
    .from(users)
    .where(eq(users.id, sellerId))
    .limit(1);
  return Boolean(user?.emailVerified);
};
