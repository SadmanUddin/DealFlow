import { and, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import {
  deals,
  dealOffers,
  dealActivities,
  dealDocuments,
} from '#models/deal.model.js';
import { businessListings } from '#models/listing.model.js';
import { users } from '#models/user.model.js';
import { conversationDocuments } from '#models/conversation.model.js';
import { AppError } from '#utils/app-error.js';
import { canTransitionDeal } from '#utils/deal-rules.js';
import { downloadObject } from '#services/document-storage.service.js';

const notFound = () =>
  new AppError(404, 'DEAL_NOT_FOUND', 'Deal was not found');
const participant = userId =>
  sql`(${deals.buyer_id} = ${userId} OR ${deals.seller_id} = ${userId})`;
const page = (pageNo, limit, total) => ({
  page: pageNo,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
export const executeDealWrite = async statement => {
  try {
    return await db.execute(statement);
  } catch (error) {
    const code = error?.code ?? error?.cause?.code;
    if (['23505', '23503', '23514', '40001', '40P01'].includes(code)) {
      throw new AppError(
        409,
        'DEAL_CONFLICT',
        'Deal data changed or conflicts with another request; reload and retry'
      );
    }
    throw error;
  }
};
const participantDeal = async (dealId, userId, admin = false) => {
  const [row] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), ...(admin ? [] : [participant(userId)])))
    .limit(1);
  if (!row) throw notFound();
  return row;
};

export const createDeal = async (buyerId, listingId) => {
  const result = await executeDealWrite(sql`
    WITH eligible AS (
      SELECT id, seller_id FROM business_listings
      WHERE id = ${listingId} AND status = 'published' AND seller_id <> ${buyerId}
      FOR SHARE
    ), created AS (
      INSERT INTO deals(listing_id, buyer_id, seller_id)
      SELECT id, ${buyerId}, seller_id FROM eligible
      ON CONFLICT DO NOTHING RETURNING *
    ), activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT id, ${buyerId}, 'deal.created', jsonb_build_object('listingId', listing_id) FROM created RETURNING id
    ), notice AS (
      INSERT INTO notifications AS inserted_notification(user_id, dedupe_key, type, payload)
      SELECT seller_id, 'deal:' || id || ':created:seller', 'deal.created', jsonb_build_object('dealId', id, 'listingId', listing_id) FROM created
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), email_event AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || id || ':created', 'deal.created', jsonb_build_object('dealId', id, 'listingId', listing_id, 'recipientIds', jsonb_build_array(seller_id)) FROM created
      ON CONFLICT (event_key) DO NOTHING RETURNING id
    ) SELECT created.* FROM created CROSS JOIN activity`);
  const createdRows = Array.isArray(result) ? result : (result?.rows ?? []);
  const created = createdRows[0];
  if (!created) {
    const [existing] = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.listing_id, listingId),
          eq(deals.buyer_id, buyerId),
          inArray(deals.status, [
            'proposed',
            'negotiating',
            'due_diligence',
            'accepted',
          ])
        )
      )
      .limit(1);
    if (existing) return { deal: existing, created: false };
    const [eligible] = await db
      .select({ id: businessListings.id })
      .from(businessListings)
      .where(
        and(
          eq(businessListings.id, listingId),
          eq(businessListings.status, 'published'),
          ne(businessListings.seller_id, buyerId)
        )
      )
      .limit(1);
    if (!eligible)
      throw new AppError(
        404,
        'LISTING_NOT_FOUND',
        'Published listing was not found'
      );
    throw new AppError(
      409,
      'DEAL_CONFLICT',
      'An active deal already exists for this listing'
    );
  }
  return { deal: created, created: true };
};

export const listDeals = async (userId, { page: pageNo, limit, view }) => {
  const where = and(
    participant(userId),
    view === 'completed' ? eq(deals.status, 'completed') : undefined,
    view === 'open'
      ? notInArray(deals.status, ['completed', 'cancelled', 'rejected'])
      : undefined,
    view === 'ended'
      ? inArray(deals.status, ['cancelled', 'rejected'])
      : undefined
  );
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: deals.id,
        deal_uid: deals.deal_uid,
        listing_id: deals.listing_id,
        buyer_id: deals.buyer_id,
        seller_id: deals.seller_id,
        status: deals.status,
        accepted_at: deals.accepted_at,
        closing_amount: deals.closing_amount,
        closing_currency: deals.closing_currency,
        completed_at: deals.completed_at,
        buyer_confirmed_at: deals.buyer_confirmed_at,
        seller_confirmed_at: deals.seller_confirmed_at,
        created_at: deals.created_at,
        updated_at: deals.updated_at,
        listing_title: businessListings.title,
        buyer_name: sql`(SELECT name FROM users WHERE id = ${deals.buyer_id})`,
        seller_name: sql`(SELECT name FROM users WHERE id = ${deals.seller_id})`,
      })
      .from(deals)
      .innerJoin(businessListings, eq(deals.listing_id, businessListings.id))
      .where(where)
      .orderBy(desc(deals.updated_at), desc(deals.id))
      .limit(limit)
      .offset((pageNo - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(deals)
      .where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { deals: rows, pagination: page(pageNo, limit, total) };
};

const dealVisibleTo = (deal, userId) => {
  const visibleDeal = { ...deal };
  if (![deal.buyer_id, deal.seller_id].includes(userId)) {
    for (const field of Object.keys(visibleDeal)) {
      if (
        field.startsWith('closing_') ||
        field.endsWith('_confirmed_at') ||
        field.endsWith('_price_consent')
      ) {
        delete visibleDeal[field];
      }
    }
  }
  return visibleDeal;
};

export const getDeal = async (dealId, userId, isAdmin = false) => {
  const deal = await participantDeal(dealId, userId, isAdmin);
  const visibleDeal = dealVisibleTo(deal, userId);
  const participants = await db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(inArray(users.id, [deal.buyer_id, deal.seller_id]));
  const buyerName = participants.find(user => user.id === deal.buyer_id)?.name;
  const sellerName = participants.find(
    user => user.id === deal.seller_id
  )?.name;
  const [agreedOffer] =
    visibleDeal.closing_revision !== undefined && deal.accepted_at
      ? await db
        .select({ amount: dealOffers.amount, currency: dealOffers.currency })
        .from(dealOffers)
        .where(
          and(
            eq(dealOffers.deal_id, dealId),
            eq(dealOffers.status, 'accepted')
          )
        )
        .limit(1)
      : [];
  return {
    ...visibleDeal,
    agreed_offer: agreedOffer ?? null,
    buyer_name: buyerName ?? null,
    seller_name: sellerName ?? null,
  };
};

export const updateDealStatus = async (dealId, userId, role, status) => {
  const current = await participantDeal(dealId, userId, role === 'admin');
  if (
    role !== 'admin' &&
    ![current.buyer_id, current.seller_id].includes(userId)
  )
    throw notFound();
  if (!canTransitionDeal(current.status, status))
    throw new AppError(
      409,
      'INVALID_DEAL_TRANSITION',
      `Cannot change deal from ${current.status} to ${status}`
    );
  const changed = await executeDealWrite(sql`
    WITH changed AS (
      UPDATE deals SET status = ${status}, updated_at = now()
      WHERE id = ${dealId} AND status = ${current.status}
      RETURNING *
    ), activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT id, ${userId}, 'deal.status_changed', jsonb_build_object('from', ${current.status}::text, 'to', ${status}::text) FROM changed RETURNING id
    ), notifications_added AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT recipients.user_id, 'deal:' || changed.id || ':status:' || changed.updated_at::text || ':' || recipients.user_id, 'deal.status_changed', jsonb_build_object('dealId', changed.id, 'status', changed.status)
      FROM changed CROSS JOIN LATERAL unnest(ARRAY[changed.buyer_id, changed.seller_id]) AS recipients(user_id) WHERE recipients.user_id <> ${userId}
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), email_event AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || changed.id || ':status:' || changed.updated_at::text, 'deal.status_changed', jsonb_build_object('dealId', changed.id, 'status', changed.status, 'recipientIds', jsonb_build_array(changed.buyer_id, changed.seller_id)) FROM changed
      ON CONFLICT (event_key) DO NOTHING RETURNING id
    ) SELECT changed.* FROM changed CROSS JOIN activity`);
  const rows = Array.isArray(changed) ? changed : (changed?.rows ?? []);
  if (!rows.length)
    throw new AppError(
      409,
      'DEAL_STATUS_CHANGED',
      'Deal status changed; reload and try again'
    );
  return dealVisibleTo(rows[0], userId);
};

const closingErrors = {
  stale: 'Closing terms changed. Review the latest terms before trying again.',
  unavailable: 'Closing requires an accepted deal and an available listing.',
  disputed: 'Resolve the dispute before continuing with closing.',
  dispute_owner: 'Only the participant who raised the dispute can clear it.',
  agreement_required: 'Both parties must agree on the proposed closing amount.',
  already_agreed:
    'The final amount has been agreed. Report a dispute to pause closing and review the terms.',
  invalid_amount:
    'Enter a positive closing amount with up to two decimal places.',
};

export const updateAcquisitionClosing = async (dealId, userId, input) => {
  const result = await executeDealWrite(sql`
    SELECT apply_acquisition_closing(
      ${dealId}::integer, ${userId}::integer, ${input.action}::text,
      ${input.revision}::integer, ${input.amount ?? null}::numeric,
      ${input.publicPriceConsent ?? null}::boolean
    ) AS outcome
  `);
  const [{ outcome }] = Array.isArray(result) ? result : result.rows;
  if (outcome === 'not_found') throw notFound();
  if (outcome !== 'ok')
    throw new AppError(
      409,
      'CLOSING_CONFLICT',
      closingErrors[outcome] ?? 'Closing could not be updated.'
    );
  return getDeal(dealId, userId);
};

export const createOffer = async (dealId, userId, input) => {
  const deal = await participantDeal(dealId, userId);
  if (!['proposed', 'negotiating', 'due_diligence'].includes(deal.status))
    throw new AppError(
      409,
      'DEAL_NOT_NEGOTIATING',
      'Offers are not accepted for this deal'
    );
  const result = await executeDealWrite(sql`
    WITH deal_guard AS MATERIALIZED (
      SELECT deal.id, deal.buyer_id, deal.seller_id, deal.status FROM deals AS deal
      WHERE deal.id = ${dealId} AND deal.status IN ('proposed','negotiating','due_diligence')
        AND ${userId} IN (deal.buyer_id, deal.seller_id)
      FOR UPDATE
    ), countered AS (
      UPDATE deal_offers AS parent SET status = 'superseded', responded_at = now()
      FROM deal_guard
      WHERE ${input.parentOfferId ?? null}::integer IS NOT NULL AND parent.id = ${input.parentOfferId ?? null}
        AND parent.deal_id = deal_guard.id AND parent.status = 'pending' AND parent.created_by <> ${userId}
      RETURNING parent.id
    ), offer AS (
      INSERT INTO deal_offers AS inserted_offer(deal_id, parent_offer_id, created_by, amount, currency, message)
      SELECT deal_guard.id, ${input.parentOfferId ?? null}, ${userId}, ${input.amount}, ${input.currency}, ${input.message ?? null}
      FROM deal_guard
      WHERE (${input.parentOfferId ?? null}::integer IS NULL OR EXISTS (SELECT 1 FROM countered))
        AND (${input.parentOfferId ?? null}::integer IS NOT NULL OR NOT EXISTS (
          SELECT 1 FROM deal_offers AS pending_offer
          WHERE pending_offer.deal_id = deal_guard.id AND pending_offer.created_by = ${userId}
            AND pending_offer.status = 'pending'
        ))
      RETURNING inserted_offer.*
    ), deal_progress AS (
      UPDATE deals AS current_deal SET status = 'negotiating', updated_at = now()
      WHERE current_deal.id = ${dealId} AND current_deal.status = 'proposed' AND EXISTS (SELECT 1 FROM offer)
      RETURNING current_deal.id, current_deal.buyer_id, current_deal.seller_id
    ), activity AS (
      INSERT INTO deal_activities AS inserted_activity(deal_id, actor_id, event_type, metadata)
      SELECT offer.deal_id, offer.created_by, CASE WHEN offer.parent_offer_id IS NULL THEN 'offer.submitted' ELSE 'offer.countered' END, jsonb_build_object('offerId', offer.id, 'amount', offer.amount, 'currency', offer.currency, 'parentOfferId', offer.parent_offer_id) FROM offer
      UNION ALL SELECT deal_progress.id, ${userId}, 'deal.status_changed', jsonb_build_object('from', 'proposed', 'to', 'negotiating') FROM deal_progress
      RETURNING inserted_activity.id
    ), notification_events AS (
      SELECT
        CAST(
          CASE WHEN offer.created_by = ${deal.buyer_id} THEN ${deal.seller_id} ELSE ${deal.buyer_id} END
          AS integer
        ) AS user_id,
        'deal:' || ${dealId} || ':offer:' || offer.id AS dedupe_key,
        CASE WHEN offer.parent_offer_id IS NULL THEN 'deal.offer' ELSE 'deal.counteroffer' END AS type,
        jsonb_build_object(
          'dealId', ${dealId}::integer,
          'offerId', offer.id,
          'senderName', (SELECT sender.name FROM users AS sender WHERE sender.id = offer.created_by),
          'listingTitle', (SELECT listing.title FROM business_listings AS listing WHERE listing.id = ${deal.listing_id})
        ) AS payload
      FROM offer
      UNION ALL
      SELECT recipients.user_id,
        'deal:' || deal_progress.id || ':negotiating:' || recipients.user_id,
        'deal.status_changed',
        jsonb_build_object('dealId', deal_progress.id, 'status', 'negotiating')
      FROM deal_progress CROSS JOIN LATERAL unnest(ARRAY[deal_progress.buyer_id, deal_progress.seller_id]) AS recipients(user_id)
      WHERE recipients.user_id <> ${userId}
    ), notify AS (
      INSERT INTO notifications AS inserted_notification(user_id, dedupe_key, type, payload)
      SELECT notification_events.user_id, notification_events.dedupe_key, notification_events.type, notification_events.payload
      FROM notification_events
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING inserted_notification.id
    ), email_events AS (
      SELECT
        'deal:' || ${dealId} || ':offer:' || offer.id AS event_key,
        CASE WHEN offer.parent_offer_id IS NULL THEN 'deal.offer' ELSE 'deal.counteroffer' END AS type,
        jsonb_build_object('dealId', ${dealId}::integer, 'offerId', offer.id, 'recipientIds', jsonb_build_array(CASE WHEN offer.created_by = ${deal.buyer_id} THEN ${deal.seller_id} ELSE ${deal.buyer_id} END)) AS payload
      FROM offer
      UNION ALL
      SELECT 'deal:' || deal_progress.id || ':negotiating',
        'deal.status_changed',
        jsonb_build_object('dealId', deal_progress.id, 'status', 'negotiating', 'recipientIds', jsonb_build_array(deal_progress.buyer_id,deal_progress.seller_id))
      FROM deal_progress
    ), email_event AS (
      INSERT INTO outbox_events AS inserted_event(event_key, type, payload)
      SELECT email_events.event_key, email_events.type, email_events.payload FROM email_events
      ON CONFLICT (event_key) DO NOTHING RETURNING inserted_event.id
    ) SELECT offer.* FROM offer CROSS JOIN activity`);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  if (!rows.length) {
    const [ownPending] = await db
      .select({ id: dealOffers.id })
      .from(dealOffers)
      .where(
        and(
          eq(dealOffers.deal_id, dealId),
          eq(dealOffers.created_by, userId),
          eq(dealOffers.status, 'pending')
        )
      )
      .limit(1);
    if (ownPending)
      throw new AppError(
        409,
        'DUPLICATE_PENDING_OFFER',
        'You already have a pending offer on this deal'
      );
    throw new AppError(
      409,
      'DEAL_NOT_NEGOTIATING',
      'Deal is no longer available for offers'
    );
  }
  return rows[0];
};

export const respondToOffer = async (dealId, offerId, userId, action) => {
  const result = await executeDealWrite(sql`
    WITH deal_guard AS MATERIALIZED (
      SELECT id, buyer_id, seller_id, status FROM deals
      WHERE id = ${dealId} AND ${userId} IN (buyer_id, seller_id)
        AND status IN ('proposed','negotiating','due_diligence')
      FOR UPDATE
    ), locked_offers AS MATERIALIZED (
      SELECT offer.id, offer.created_by
      FROM deal_guard JOIN deal_offers AS offer ON offer.deal_id = deal_guard.id
      WHERE offer.status = 'pending'
      ORDER BY offer.id
      FOR UPDATE OF offer
    ), target AS MATERIALIZED (
      SELECT locked_offers.id, locked_offers.created_by, deal_guard.status AS old_deal_status,
             deal_guard.buyer_id, deal_guard.seller_id
      FROM deal_guard JOIN locked_offers ON locked_offers.id = ${offerId}
      WHERE locked_offers.created_by <> ${userId}
    ), accepted_deal AS (
      UPDATE deals AS deal SET status = 'accepted', updated_at = now()
      FROM target
      WHERE ${action === 'accept'} AND deal.id = ${dealId} AND deal.status = target.old_deal_status
      RETURNING deal.id, deal.buyer_id, deal.seller_id, target.old_deal_status
    ), changed AS (
      UPDATE deal_offers AS offer
      SET status = ${action === 'accept' ? 'accepted' : 'rejected'}, responded_at = now()
      FROM target
      WHERE offer.id = target.id AND offer.status = 'pending'
        AND (${action === 'reject'} OR EXISTS (SELECT 1 FROM accepted_deal))
      RETURNING offer.*, target.old_deal_status
    ), superseded AS (
      UPDATE deal_offers AS offer SET status = 'superseded', responded_at = now()
      FROM locked_offers, accepted_deal
      WHERE ${action === 'accept'} AND offer.id = locked_offers.id
        AND offer.deal_id = ${dealId} AND offer.id <> ${offerId} AND offer.status = 'pending'
      RETURNING offer.id
    ), activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT deal_id, ${userId}, ${action === 'accept' ? 'offer.accepted' : 'offer.rejected'}, jsonb_build_object('offerId', id) FROM changed RETURNING id
    ), notify AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT changed.created_by,
        'deal:' || ${dealId} || ':offer:' || changed.id || ':' || ${action}, ${action === 'accept' ? 'deal.offer_accepted' : 'deal.offer_rejected'}, jsonb_build_object('dealId', ${dealId}::integer, 'offerId', changed.id)
      FROM changed ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), email_event AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || ${dealId} || ':offer:' || changed.id || ':' || ${action}, ${action === 'accept' ? 'deal.offer_accepted' : 'deal.offer_rejected'},
        jsonb_build_object('dealId', ${dealId}::integer, 'offerId', changed.id, 'recipientIds', jsonb_build_array(changed.created_by))
      FROM changed ON CONFLICT (event_key) DO NOTHING RETURNING id
    ), status_activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT id, ${userId}, 'deal.status_changed', jsonb_build_object('from', old_deal_status, 'to', 'accepted') FROM accepted_deal RETURNING id
    ), status_notice AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT recipients.user_id, 'deal:' || accepted_deal.id || ':accepted:' || recipients.user_id, 'deal.status_changed', jsonb_build_object('dealId', accepted_deal.id, 'status', 'accepted')
      FROM accepted_deal CROSS JOIN LATERAL unnest(ARRAY[accepted_deal.buyer_id, accepted_deal.seller_id]) AS recipients(user_id) WHERE recipients.user_id <> ${userId}
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), status_email AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || id || ':accepted', 'deal.status_changed', jsonb_build_object('dealId', id, 'status', 'accepted', 'recipientIds', jsonb_build_array(buyer_id, seller_id)) FROM accepted_deal
      ON CONFLICT (event_key) DO NOTHING RETURNING id
    ) SELECT changed.* FROM changed CROSS JOIN activity`);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  if (!rows.length)
    throw new AppError(
      409,
      'OFFER_NOT_RESPONDABLE',
      'Offer is not pending, belongs to you, or the deal is closed'
    );
  return rows[0];
};

export const withdrawOffer = async (dealId, offerId, userId) => {
  const result = await executeDealWrite(sql`
    WITH deal_guard AS MATERIALIZED (
      SELECT id, buyer_id, seller_id FROM deals
      WHERE id = ${dealId} AND ${userId} IN (buyer_id, seller_id)
        AND status IN ('proposed','negotiating','due_diligence')
      FOR UPDATE
    ), target AS MATERIALIZED (
      SELECT offer.id, offer.created_by, deal_guard.buyer_id, deal_guard.seller_id
      FROM deal_guard JOIN deal_offers AS offer ON offer.deal_id = deal_guard.id
      WHERE offer.id = ${offerId} AND offer.created_by = ${userId} AND offer.status = 'pending'
      FOR UPDATE OF offer
    ), changed AS (
      UPDATE deal_offers AS offer SET status = 'withdrawn', responded_at = now()
      FROM target WHERE offer.id = target.id AND offer.status = 'pending'
      RETURNING offer.*, target.buyer_id, target.seller_id
    ), activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT deal_id, ${userId}, 'offer.withdrawn', jsonb_build_object('offerId', id) FROM changed RETURNING id
    ), notice AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT CASE WHEN ${userId} = changed.buyer_id THEN changed.seller_id ELSE changed.buyer_id END, 'deal:' || ${dealId} || ':offer:' || changed.id || ':withdrawn', 'deal.offer_withdrawn', jsonb_build_object('dealId', ${dealId}::integer, 'offerId', changed.id)
      FROM changed ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), email_event AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || ${dealId} || ':offer:' || changed.id || ':withdrawn', 'deal.offer_withdrawn', jsonb_build_object('dealId', ${dealId}::integer, 'offerId', changed.id, 'recipientIds', jsonb_build_array(CASE WHEN ${userId} = changed.buyer_id THEN changed.seller_id ELSE changed.buyer_id END))
      FROM changed ON CONFLICT (event_key) DO NOTHING RETURNING id
    ) SELECT changed.* FROM changed CROSS JOIN activity`);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  if (!rows.length)
    throw new AppError(
      409,
      'OFFER_NOT_WITHDRAWABLE',
      'Only your pending offer on an open deal can be withdrawn'
    );
  return rows[0];
};

export const listOffers = async (dealId, userId, { page: pageNo, limit }) => {
  await participantDeal(dealId, userId);
  const where = eq(dealOffers.deal_id, dealId);
  const [offers, counts] = await Promise.all([
    db
      .select({
        id: dealOffers.id,
        deal_id: dealOffers.deal_id,
        parent_offer_id: dealOffers.parent_offer_id,
        created_by: dealOffers.created_by,
        created_by_name: users.name,
        amount: dealOffers.amount,
        currency: dealOffers.currency,
        message: dealOffers.message,
        status: dealOffers.status,
        created_at: dealOffers.created_at,
        responded_at: dealOffers.responded_at,
      })
      .from(dealOffers)
      .innerJoin(users, eq(dealOffers.created_by, users.id))
      .where(where)
      .orderBy(dealOffers.created_at, dealOffers.id)
      .limit(limit)
      .offset((pageNo - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(dealOffers)
      .where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { offers, pagination: page(pageNo, limit, total) };
};
export const listDealActivities = async (
  dealId,
  userId,
  isAdmin,
  { page: pageNo, limit }
) => {
  const deal = await participantDeal(dealId, userId, isAdmin);
  const isParticipant = [deal.buyer_id, deal.seller_id].includes(userId);
  const visibleActivity = isParticipant
    ? eq(dealActivities.deal_id, dealId)
    : and(
      eq(dealActivities.deal_id, dealId),
      sql`NOT (${dealActivities.metadata} ?| ARRAY['checklistItemId', 'documentRequestId'])`
    );
  const [activities, counts] = await Promise.all([
    db
      .select({
        id: dealActivities.id,
        deal_id: dealActivities.deal_id,
        actor_id: dealActivities.actor_id,
        actor_name: users.name,
        event_type: dealActivities.event_type,
        metadata: dealActivities.metadata,
        created_at: dealActivities.created_at,
      })
      .from(dealActivities)
      .leftJoin(users, eq(dealActivities.actor_id, users.id))
      .where(visibleActivity)
      .orderBy(desc(dealActivities.created_at), desc(dealActivities.id))
      .limit(limit)
      .offset((pageNo - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(dealActivities)
      .where(visibleActivity),
  ]);
  const total = counts[0]?.count ?? 0;
  return {
    activities: isParticipant
      ? activities
      : activities.map(activity =>
        activity.event_type.startsWith('deal.closing_')
          ? { ...activity, metadata: {} }
          : activity
      ),
    pagination: page(pageNo, limit, total),
  };
};

export const linkDealDocument = async (dealId, userId, documentId) => {
  const deal = await participantDeal(dealId, userId);
  const result = await executeDealWrite(sql`
    WITH eligible AS (
      SELECT document.id FROM conversation_documents AS document
      JOIN conversations AS conversation ON conversation.id = document.conversation_id
      WHERE document.id = ${documentId} AND document.status = 'available' AND document.deleted_at IS NULL
        AND conversation.listing_id = ${deal.listing_id} AND conversation.buyer_id = ${deal.buyer_id}
        AND conversation.seller_id = ${deal.seller_id}
    ), linked AS (
      INSERT INTO deal_documents(deal_id, conversation_document_id, linked_by)
      SELECT ${dealId}, id, ${userId} FROM eligible ON CONFLICT (deal_id, conversation_document_id) DO NOTHING RETURNING *
    ), activity AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT deal_id, ${userId}, 'deal.document_linked', jsonb_build_object('documentId', conversation_document_id) FROM linked RETURNING id
    ), notice AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT ${userId === deal.buyer_id ? deal.seller_id : deal.buyer_id}, 'deal:' || ${dealId} || ':document:' || conversation_document_id, 'deal.document_added', jsonb_build_object('dealId', ${dealId}::integer, 'documentId', conversation_document_id)
      FROM linked ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    ), email_event AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:' || ${dealId} || ':document:' || conversation_document_id, 'deal.document_added', jsonb_build_object('dealId', ${dealId}::integer, 'documentId', conversation_document_id, 'recipientIds', jsonb_build_array(${userId === deal.buyer_id ? deal.seller_id : deal.buyer_id}::integer))
      FROM linked ON CONFLICT (event_key) DO NOTHING RETURNING id
    ) SELECT linked.* FROM linked CROSS JOIN activity`);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  if (rows.length) return rows[0];
  const [existing] = await db
    .select()
    .from(dealDocuments)
    .where(
      and(
        eq(dealDocuments.deal_id, dealId),
        eq(dealDocuments.conversation_document_id, documentId)
      )
    )
    .limit(1);
  if (existing) return existing;
  throw new AppError(
    404,
    'DOCUMENT_NOT_FOUND',
    'Eligible conversation document was not found'
  );
};

export const listDealDocuments = async (
  dealId,
  userId,
  { page: pageNo, limit }
) => {
  await participantDeal(dealId, userId);
  const where = and(
    eq(dealDocuments.deal_id, dealId),
    eq(conversationDocuments.status, 'available'),
    sql`${conversationDocuments.deleted_at} IS NULL`
  );
  const [documents, counts] = await Promise.all([
    db
      .select({
        id: conversationDocuments.id,
        filename: conversationDocuments.original_filename,
        uploadedBy: conversationDocuments.uploaded_by,
        mimeType: conversationDocuments.mime_type,
        sizeBytes: conversationDocuments.size_bytes,
        createdAt: conversationDocuments.created_at,
      })
      .from(dealDocuments)
      .innerJoin(
        conversationDocuments,
        eq(conversationDocuments.id, dealDocuments.conversation_document_id)
      )
      .where(where)
      .orderBy(desc(dealDocuments.created_at), desc(dealDocuments.id))
      .limit(limit)
      .offset((pageNo - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(dealDocuments)
      .innerJoin(
        conversationDocuments,
        eq(conversationDocuments.id, dealDocuments.conversation_document_id)
      )
      .where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { documents, pagination: page(pageNo, limit, total) };
};

export const getDealDocumentDownload = async (dealId, documentId, userId) => {
  await participantDeal(dealId, userId);
  const [row] = await db
    .select({
      id: conversationDocuments.id,
      storage_key: conversationDocuments.storage_key,
      original_filename: conversationDocuments.original_filename,
      mime_type: conversationDocuments.mime_type,
      size_bytes: conversationDocuments.size_bytes,
    })
    .from(dealDocuments)
    .innerJoin(
      conversationDocuments,
      eq(conversationDocuments.id, dealDocuments.conversation_document_id)
    )
    .where(
      and(
        eq(dealDocuments.deal_id, dealId),
        eq(conversationDocuments.id, documentId),
        eq(conversationDocuments.status, 'available'),
        sql`${conversationDocuments.deleted_at} IS NULL`
      )
    )
    .limit(1);
  if (!row)
    throw new AppError(
      404,
      'DOCUMENT_NOT_FOUND',
      'Deal document was not found'
    );
  return { row, stream: await downloadObject(row.storage_key) };
};
