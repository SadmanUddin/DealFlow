import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { notificationEmailPreferences, notifications, outboxEvents } from '#models/phase6.model.js';
import { users } from '#models/user.model.js';
import { sendEmail } from '#services/email/email.adapter.js';
import { listingEmailTemplate } from '#services/email/templates/listing-notification.js';
import logger from '#config/logger.js';

const maxAttempts = 8;
const extractRows = result => Array.isArray(result) ? result : result?.rows ?? [];
const activeLease = sql`${outboxEvents.locked_at} > now() - interval '60 seconds'`;

export const claimOutboxBatch = async (limit = 20, { eventId } = {}) => {
  const token = randomUUID();
  const eventIdFilter = eventId ?? null;
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT id FROM outbox_events
      WHERE status <> 'quarantined'
        AND ((status = 'pending' AND available_at <= now())
         OR (status = 'processing' AND locked_at < now() - interval '60 seconds'))
        AND (${eventIdFilter}::integer IS NULL OR id = ${eventIdFilter})
      ORDER BY available_at, id
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE outbox_events AS event
    SET status = 'processing', attempts = event.attempts + 1,
        locked_at = now(), lock_token = ${token}, last_error = NULL
    FROM candidates WHERE event.id = candidates.id
    RETURNING event.id, event.event_key AS "eventKey", event.type,
              event.payload, event.attempts, event.lock_token AS "lockToken"
  `);
  return extractRows(result);
};

const processListingEvent = async (event, assertLease) => {
  const payload = event.payload;
  if (!payload || !Number.isSafeInteger(Number(payload.listingId)) || typeof payload.title !== 'string' || !Array.isArray(payload.userIds)) {
    const error = new Error('Invalid listing event payload');
    error.permanent = true;
    throw error;
  }
  if (!payload.userIds.length) return;
  const recipients = await db.select({ userId: users.id, email: users.email, emailVerified: users.email_verified, listingStatus: notificationEmailPreferences.listing_status, listingPrice: notificationEmailPreferences.listing_price, listingDetails: notificationEmailPreferences.listing_details }).from(users).leftJoin(notificationEmailPreferences, eq(notificationEmailPreferences.user_id, users.id)).where(and(inArray(users.id, payload.userIds), eq(users.is_active, true)));
  for (const recipient of recipients) {
    await assertLease();
    await db.insert(notifications).values({
      user_id: recipient.userId,
      dedupe_key: `${event.eventKey}:user:${recipient.userId}`,
      type: event.type,
      payload: {
        listingId: Number(payload.listingId),
        title: payload.title,
        ...(payload.askingPrice !== undefined ? { askingPrice: payload.askingPrice, currency: payload.currency } : {}),
        ...(payload.priceChanged ? { priceChanged: true } : {}),
        ...(payload.detailsChanged ? { detailsChanged: true } : {}),
      },
    }).onConflictDoNothing({ target: notifications.dedupe_key });

    const enabledCategories = {
      listing_status: recipient.listingStatus !== false,
      listing_price: recipient.listingPrice !== false,
      listing_details: recipient.listingDetails !== false,
    };
    const relevantCategories = new Set();
    if (['listing.approved', 'listing.rejected', 'listing.archived'].includes(event.type)) relevantCategories.add('listing_status');
    if (event.type === 'listing.price_changed' || payload.priceChanged) relevantCategories.add('listing_price');
    if (event.type === 'listing.details_changed' || payload.detailsChanged) relevantCategories.add('listing_details');
    const enabledRelevant = [...relevantCategories].filter(category => enabledCategories[category]);
    if (enabledRelevant.length && recipient.emailVerified && recipient.email) {
      await assertLease();
      const selectedCategory = enabledRelevant.includes('listing_status')
        ? 'listing_status'
        : enabledRelevant.includes('listing_price')
          ? 'listing_price'
          : 'listing_details';
      const emailType = selectedCategory === 'listing_status'
        ? event.type
        : selectedCategory === 'listing_price'
          ? 'listing.price_changed'
          : 'listing.details_changed';
      const template = listingEmailTemplate({
        type: emailType,
        ...payload,
        includePrice: enabledCategories.listing_price,
      });
      try {
        await sendEmail({ to: recipient.email, ...template, idempotencyKey: `${event.eventKey}:email:${recipient.userId}`, signal: event.signal });
      } catch (error) {
        if (error.permanent) {
          logger.warn('Permanent notification email failure', { eventId: event.id, userId: recipient.userId });
          continue;
        }
        throw error;
      }
    }
  }
};

export const processOutboxEvent = async (event, { assertLease = async () => {} } = {}) => {
  if (!event.type.startsWith('listing.')) {
    const error = new Error('Unsupported outbox event type');
    error.permanent = true;
    throw error;
  }
  await processListingEvent(event, assertLease);
};

export const renewOutboxLease = async event => {
  const [owned] = await db.update(outboxEvents)
    .set({ locked_at: sql`now()` })
    .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'processing'), eq(outboxEvents.lock_token, event.lockToken), activeLease))
    .returning({ id: outboxEvents.id });
  return Boolean(owned);
};

export const finishOutboxEvent = async event => {
  const [updated] = await db.update(outboxEvents)
    .set({ status: 'processed', processed_at: sql`now()`, locked_at: null, lock_token: null, last_error: null })
    .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'processing'), eq(outboxEvents.lock_token, event.lockToken), activeLease))
    .returning({ id: outboxEvents.id });
  return Boolean(updated);
};

export const failOutboxEvent = async (event, error) => {
  const dead = error.permanent || event.attempts >= maxAttempts;
  const safeError = (error.message || 'Event processing failed').replace(/(?:Bearer\s+)[^\s]+/gi, '[redacted]').slice(0, 500);
  const delayMs = Math.min(3600000, 5000 * (2 ** Math.max(0, event.attempts - 1)));
  const [updated] = await db.update(outboxEvents)
    .set({ status: dead ? 'dead' : 'pending', available_at: sql`now() + ${delayMs} * interval '1 millisecond'`, locked_at: null, lock_token: null, last_error: safeError })
    .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'processing'), eq(outboxEvents.lock_token, event.lockToken), activeLease))
    .returning({ id: outboxEvents.id });
  if (!updated) return false;
  logger[dead ? 'error' : 'warn']('Outbox event processing failed', { eventId: event.id, eventType: event.type, attempts: event.attempts, dead, error: safeError });
  return true;
};

export const createOutboxLeaseGuard = (refreshLease, onLost = () => {}) => {
  let lost = false;
  let refreshInFlight;
  const lose = () => {
    if (lost) return;
    lost = true;
    onLost();
  };
  const assertLease = async () => {
    if (lost) throw new Error('Outbox event lease is no longer owned');
    try {
      refreshInFlight ??= Promise.resolve().then(refreshLease).finally(() => { refreshInFlight = undefined; });
      if (!(await refreshInFlight)) {
        lose();
        throw new Error('Outbox event lease is no longer owned');
      }
    } catch (error) {
      lose();
      throw error;
    }
  };
  return { assertLease, lose, get lost() { return lost; } };
};

export const processClaimedEvent = async event => {
  const abortController = new globalThis.AbortController();
  const lease = createOutboxLeaseGuard(() => renewOutboxLease(event), () => abortController.abort());
  const heartbeat = setInterval(() => {
    lease.assertLease().catch(error => logger.warn('Outbox lease refresh failed; event processing stopped', { eventId: event.id, eventType: event.type, error: error.message }));
  }, 20000);
  heartbeat.unref?.();
  try {
    await lease.assertLease();
    await processOutboxEvent({ ...event, signal: abortController.signal }, { assertLease: lease.assertLease });
    clearInterval(heartbeat);
    await lease.assertLease();
    const completed = await finishOutboxEvent(event);
    if (!completed) {
      lease.lose();
      logger.warn('Stale outbox worker did not update event state', { eventId: event.id, eventType: event.type });
      return;
    }
    logger.info('Outbox event processed', { eventId: event.id, eventType: event.type });
  } catch (error) {
    clearInterval(heartbeat);
    if (lease.lost) {
      logger.warn('Outbox event processing stopped after lease loss', { eventId: event.id, eventType: event.type });
    } else {
      await failOutboxEvent(event, error);
    }
  } finally {
    clearInterval(heartbeat);
  }
};

export const processOutboxBatch = async (limit = 20) => {
  const events = await claimOutboxBatch(limit);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, events.length) }, async () => {
    while (cursor < events.length) {
      const event = events[cursor++];
      await processClaimedEvent(event);
    }
  });
  await Promise.all(workers);
  return events.length;
};
