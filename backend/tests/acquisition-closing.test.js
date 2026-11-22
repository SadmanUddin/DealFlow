import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let engine;
let database;
vi.mock('#config/database.js', () => ({
  get db() {
    return database;
  },
}));

const {
  createDeal,
  createOffer,
  respondToOffer,
  getDeal,
  listDeals,
  listDealActivities,
  listDealDocuments,
  updateAcquisitionClosing,
  updateDealStatus,
} = await import('#services/deal.service.js');
const { startConversation, getDealConversation } =
  await import('#services/conversation.service.js');
const { getPublicListings, getPublishedListing, getMyListings } =
  await import('#services/listing.service.js');
const { closingActionSchema, dealStatusSchema } =
  await import('#validations/deal.validation.js');

const buyer = 1;
const seller = 2;
const otherBuyer = 3;
const browse = { page: 1, limit: 20 };

beforeAll(async () => {
  engine = new PGlite({ extensions: { pg_trgm } });
  database = drizzle(engine);
  const root = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', root), 'utf8')
  );
  for (const { tag } of journal.entries) {
    await engine.exec(readFileSync(new URL(tag + '.sql', root), 'utf8'));
  }
  await engine.exec(`
    INSERT INTO users (id, name, email, password, role) VALUES
      (1, 'Buyer', 'buyer@example.test', 'fixture', 'buyer'),
      (2, 'Seller', 'seller@example.test', 'fixture', 'seller'),
      (3, 'Other Buyer', 'other@example.test', 'fixture', 'buyer'),
      (4, 'New Buyer', 'new@example.test', 'fixture', 'buyer');
  `);
}, 30000);

afterAll(async () => {
  await engine?.close();
});

async function listing(status = 'published', title = 'Test business') {
  const { rows } = await engine.query(
    `
    INSERT INTO business_listings (seller_id, title, description, status, asking_price, currency, published_at)
    VALUES (2, $1, 'Isolated closing fixture', $2, 125000, 'EUR', now()) RETURNING id
  `,
    [title, status]
  );
  return rows[0].id;
}

async function accepted(listingId, buyerId = buyer) {
  const deal = (await createDeal(buyerId, listingId)).deal;
  const offer = await createOffer(deal.id, buyerId, {
    amount: '110000',
    currency: 'EUR',
  });
  const counter = await createOffer(deal.id, seller, {
    amount: '115000',
    currency: 'EUR',
    parentOfferId: offer.id,
  });
  await respondToOffer(deal.id, counter.id, buyerId, 'accept');
  return deal.id;
}

const act = (id, userId, action, revision, extra = {}) =>
  updateAcquisitionClosing(
    id,
    userId,
    closingActionSchema.parse({ action, revision, ...extra })
  );
const confirm = (id, userId, revision, publicPriceConsent) =>
  act(id, userId, 'confirm', revision, { publicPriceConsent });

describe('acquisition closing on the migrated PostgreSQL schema', () => {
  it('requires agreement and both confirmations, pauses on dispute, and preserves private history', async () => {
    const listingId = await listing('published', 'Private closing fixture');
    const dealId = await accepted(listingId);
    const competingDeal = (await createDeal(otherBuyer, listingId)).deal;
    const competingOffer = await createOffer(competingDeal.id, otherBuyer, {
      amount: '17000',
      currency: 'EUR',
    });
    const { conversation } = await startConversation(buyer, listingId);
    await startConversation(otherBuyer, listingId);
    await engine.query(
      `
      WITH document AS (
        INSERT INTO conversation_documents(conversation_id, uploaded_by, storage_key, original_filename, mime_type, size_bytes, sha256, status)
        VALUES ($1, 2, 'test/private', 'contract.pdf', 'application/pdf', 100, repeat('a', 64), 'available') RETURNING id
      )
      INSERT INTO deal_documents(deal_id, conversation_document_id, linked_by)
      SELECT $2, id, 2 FROM document
    `,
      [conversation.id, dealId]
    );

    expect((await getDeal(dealId, buyer)).status).toBe('accepted');
    expect((await getPublishedListing(listingId)).status).toBe('published');
    expect(dealStatusSchema.safeParse({ status: 'completed' }).success).toBe(
      false
    );
    await expect(
      updateDealStatus(dealId, buyer, 'buyer', 'completed')
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      engine.query('UPDATE deals SET status = \'completed\' WHERE id = $1', [
        dealId,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(confirm(dealId, otherBuyer, 0, true)).rejects.toMatchObject({
      status: 404,
    });

    await act(dealId, buyer, 'propose', 0, { amount: '113200.37' });
    await expect(act(dealId, buyer, 'agree', 1)).rejects.toMatchObject({
      status: 409,
    });
    await expect(confirm(dealId, seller, 1, false)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, seller, 'propose', 1, { amount: '114300.25' });
    await expect(act(dealId, buyer, 'agree', 1)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, buyer, 'agree', 2);
    await expect(
      act(dealId, buyer, 'propose', 2, { amount: '100000' })
    ).rejects.toMatchObject({ status: 409 });

    const first = await confirm(dealId, buyer, 2, true);
    expect(first).toMatchObject({
      status: 'accepted',
      seller_confirmed_at: null,
    });
    expect(first.buyer_confirmed_at).toBeTruthy();
    expect((await getPublishedListing(listingId)).status).toBe('published');
    const repeat = await confirm(dealId, buyer, 2, false);
    expect(repeat.buyer_price_consent).toBe(true);
    const beforeDispute = await listDealActivities(
      dealId,
      buyer,
      false,
      browse
    );
    expect(
      beforeDispute.activities.filter(
        event => event.event_type === 'deal.closing_confirmed'
      )
    ).toHaveLength(1);
    await act(dealId, seller, 'dispute', 2);
    await expect(confirm(dealId, seller, 3, false)).rejects.toMatchObject({
      status: 409,
    });
    await expect(act(dealId, buyer, 'resolve', 3)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, seller, 'resolve', 3);
    expect((await getDeal(dealId, buyer)).buyer_confirmed_at).toBeNull();

    await act(dealId, seller, 'propose', 4, { amount: '114300.25' });
    await act(dealId, buyer, 'agree', 5);
    const [sellerResult, buyerResult] = await Promise.all([
      confirm(dealId, seller, 5, false),
      confirm(dealId, buyer, 5, true),
    ]);
    expect(sellerResult.seller_confirmed_at).toBeTruthy();
    expect(buyerResult.buyer_confirmed_at).toBeTruthy();
    await confirm(dealId, buyer, 5, true);
    expect(await getDeal(dealId, seller)).toMatchObject({
      status: 'completed',
      closing_amount: '114300.25',
    });
    expect(
      (await listDeals(buyer, { ...browse, view: 'completed' })).deals.map(
        deal => deal.id
      )
    ).toContain(dealId);
    expect((await getMyListings(seller, browse)).soldCount).toBeGreaterThan(0);
    const sold = await getPublishedListing(listingId);
    expect(sold).toMatchObject({
      status: 'sold',
      askingPrice: '125000.00',
      publicSalePrice: null,
      publicSaleCurrency: null,
    });
    expect(sold.soldAt).toBeTruthy();
    expect(JSON.stringify(sold)).not.toContain('114300');
    expect((await getDeal(competingDeal.id, otherBuyer)).status).toBe(
      'cancelled'
    );
    await expect(
      createOffer(competingDeal.id, otherBuyer, {
        amount: '100000',
        currency: 'EUR',
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      respondToOffer(competingDeal.id, competingOffer.id, seller, 'accept')
    ).rejects.toMatchObject({ status: 409 });
    await expect(startConversation(4, listingId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(createDeal(4, listingId)).rejects.toMatchObject({
      status: 404,
    });
    expect((await getDealConversation(dealId, seller)).id).toBe(
      conversation.id
    );
    expect(
      (await listDealDocuments(dealId, buyer, browse)).documents[0].filename
    ).toBe('contract.pdf');
    await expect(
      listDealDocuments(dealId, otherBuyer, browse)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      engine.query(
        'UPDATE business_listings SET status = \'published\' WHERE id = $1',
        [listingId]
      )
    ).rejects.toMatchObject({ code: '23514' });

    const { rows: notifications } = await engine.query(
      'SELECT user_id, type, payload FROM notifications'
    );
    expect(
      notifications.filter(
        n => n.type === 'deal.completed' && n.payload.dealId === dealId
      )
    ).toHaveLength(2);
    expect(
      notifications.filter(
        n => n.type === 'deal.closing_disputed' && n.payload.dealId === dealId
      )
    ).toHaveLength(1);
    expect(
      notifications.filter(
        n =>
          n.type === 'listing.sold' &&
          n.user_id === otherBuyer &&
          n.payload.listingId === listingId
      )
    ).toHaveLength(1);
  }, 15000);

  it('allows only one closing on a listing, publishes the mutually authorized price, and filters before pagination', async () => {
    const listingId = await listing('published', 'Marketplace filter fixture');
    const liveId = await listing(
      'published',
      'Marketplace filter fixture available'
    );
    await listing('draft', 'Marketplace filter fixture draft');
    await listing('archived', 'Marketplace filter fixture archived');
    const firstId = await accepted(listingId);
    const secondId = await accepted(listingId, otherBuyer);

    for (const [id, actor] of [
      [firstId, buyer],
      [secondId, otherBuyer],
    ]) {
      await act(id, actor, 'propose', 0, { amount: '112222.45' });
      await act(id, seller, 'agree', 1);
      await confirm(id, actor, 1, true);
    }
    const results = await Promise.allSettled([
      confirm(firstId, seller, 1, true),
      confirm(secondId, seller, 1, true),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const sold = await getPublishedListing(listingId);
    expect(sold).toMatchObject({
      publicSalePrice: '112222.45',
      publicSaleCurrency: 'EUR',
    });

    const search = {
      ...browse,
      q: 'Marketplace filter fixture',
      limit: 1,
      minPrice: '120000',
    };
    const soldPage = await getPublicListings({
      ...search,
      availability: 'sold',
    });
    expect(soldPage.pagination.total).toBe(1);
    expect(soldPage.listings.map(row => row.id)).toEqual([listingId]);
    const availablePage = await getPublicListings(search);
    expect(availablePage.pagination.total).toBe(1);
    expect(availablePage.listings.map(row => row.id)).toEqual([liveId]);
    const allPage = await getPublicListings({
      ...search,
      availability: 'all',
      page: 2,
    });
    expect(allPage.pagination.total).toBe(2);
    expect(allPage.listings).toHaveLength(1);
  }, 15000);
});
