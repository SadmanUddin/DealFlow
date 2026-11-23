import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { buyerSavedSearches as searches } from '#models/saved-search.model.js';
import { AppError } from '#utils/app-error.js';

const projection = {
  id: searches.id,
  name: searches.name,
  filters: searches.filters,
  alertsEnabled: searches.alerts_enabled,
  frequency: searches.frequency,
  createdAt: searches.created_at,
  updatedAt: searches.updated_at,
};
const owned = (buyerId, id) =>
  and(eq(searches.id, id), eq(searches.buyer_id, buyerId));
const found = row => {
  if (!row)
    throw new AppError(
      404,
      'SAVED_SEARCH_NOT_FOUND',
      'Saved search was not found'
    );
  return row;
};

export const listSavedSearches = async (buyerId, { page, limit }) => {
  const where = eq(searches.buyer_id, buyerId);
  const [savedSearches, [{ total }]] = await Promise.all([
    db
      .select(projection)
      .from(searches)
      .where(where)
      .orderBy(desc(searches.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(searches).where(where),
  ]);
  return {
    savedSearches,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getSavedSearch = async (buyerId, id) => {
  const [row] = await db
    .select(projection)
    .from(searches)
    .where(owned(buyerId, id))
    .limit(1);
  return found(row);
};

export const createSavedSearch = async (buyerId, input) => {
  const [row] = await db
    .insert(searches)
    .values({
      buyer_id: buyerId,
      name: input.name,
      filters: input.filters,
      alerts_enabled: input.alertsEnabled,
      frequency: input.frequency,
      active_since: sql`clock_timestamp()`,
    })
    .returning(projection);
  return row;
};

export const updateSavedSearch = async (buyerId, id, input) => {
  const [row] = await db
    .update(searches)
    .set({
      name: input.name,
      filters: input.filters,
      alerts_enabled: input.alertsEnabled,
      frequency: input.frequency,
      updated_at: sql`clock_timestamp()`,
      active_since: sql`CASE WHEN (
      ${input.filters ? sql`${searches.filters} IS DISTINCT FROM ${JSON.stringify(input.filters)}::jsonb` : sql`false`}
      OR (${input.alertsEnabled ?? null}::boolean IS TRUE AND NOT ${searches.alerts_enabled})
    ) THEN clock_timestamp() ELSE ${searches.active_since} END`,
    })
    .where(owned(buyerId, id))
    .returning(projection);
  return found(row);
};

export const deleteSavedSearch = async (buyerId, id) => {
  const [row] = await db
    .delete(searches)
    .where(owned(buyerId, id))
    .returning({ id: searches.id });
  found(row);
};
