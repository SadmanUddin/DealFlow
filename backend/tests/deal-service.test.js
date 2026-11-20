import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, rowsByTable, executed, tables, downloadObject } = vi.hoisted(() => {
  const tables = {};
  const column = (name, field) => ({ table: name, field });
  for (const [name, fields] of Object.entries({
    deals: [
      'id',
      'listing_id',
      'buyer_id',
      'seller_id',
      'status',
      'created_at',
      'updated_at',
    ],
    dealOffers: [
      'id',
      'deal_id',
      'parent_offer_id',
      'created_by',
      'amount',
      'currency',
      'message',
      'status',
      'created_at',
    ],
    dealActivities: ['id', 'deal_id', 'created_at'],
    dealDocuments: ['id', 'deal_id', 'conversation_document_id', 'created_at'],
    businessListings: ['id', 'seller_id', 'status'],
    conversationDocuments: [
      'id',
      'conversation_id',
      'status',
      'deleted_at',
      'storage_key',
      'original_filename',
      'mime_type',
      'size_bytes',
    ],
  })) {
    tables[name] = { __name: name };
    for (const field of fields) tables[name][field] = column(name, field);
  }
  const rowsByTable = {};
  const executed = [];
  const downloadObject = vi.fn(async () => ({ on() {}, pipe() {} }));
  const db = {
    execute: vi.fn(async query => {
      executed.push(query);
      return db.executeResults.shift() ?? [];
    }),
    executeResults: [],
    selectResults: [],
    select: vi.fn(() => {
      const query = {
        from(target) {
          this.target = target;
          return this;
        },
        innerJoin() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return this;
        },
        orderBy() {
          return this;
        },
        offset() {
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve(
            db.selectResults.length
              ? db.selectResults.shift()
              : (rowsByTable[this.target?.__name] ?? [])
          ).then(resolve, reject);
        },
      };
      return query;
    }),
  };
  return { db, rowsByTable, executed, tables, downloadObject };
});

vi.mock('#config/database.js', () => ({ db }));
vi.mock('#models/deal.model.js', () => ({
  deals: tables.deals,
  dealOffers: tables.dealOffers,
  dealActivities: tables.dealActivities,
  dealDocuments: tables.dealDocuments,
}));
vi.mock('#models/listing.model.js', () => ({
  businessListings: tables.businessListings,
}));
vi.mock('#models/conversation.model.js', () => ({
  conversationDocuments: tables.conversationDocuments,
}));
vi.mock('#services/document-storage.service.js', () => ({ downloadObject }));
vi.mock('drizzle-orm', () => ({
  and: (...conditions) => ({ operator: 'and', conditions }),
  desc: column => ({ column }),
  eq: (column, value) => ({ operator: 'eq', column, value }),
  inArray: (column, value) => ({ operator: 'inArray', column, value }),
  ne: (column, value) => ({ operator: 'ne', column, value }),
  sql: Object.assign(
    (strings, ...values) => ({ query: strings.join('?'), values }),
    { raw: value => ({ query: value }) }
  ),
}));

const {
  createDeal,
  updateDealStatus,
  createOffer,
  respondToOffer,
  withdrawOffer,
  listDealDocuments,
  getDealDocumentDownload,
} = await import('#services/deal.service.js');

describe('Phase 8 deal service writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executed.length = 0;
    db.executeResults.length = 0;
    db.selectResults.length = 0;
    downloadObject.mockClear();
    for (const key of Object.keys(rowsByTable)) delete rowsByTable[key];
  });

  it('creates deals with activity, in-app notification, and outbox event in one SQL statement', async () => {
    db.executeResults.push([
      { id: 31, listing_id: 8, buyer_id: 4, seller_id: 7, status: 'proposed' },
    ]);
    const result = await createDeal(4, 8);
    expect(result).toMatchObject({ created: true, deal: { id: 31 } });
    expect(executed[0].query).toContain('INSERT INTO deals');
    expect(executed[0].query).toContain('INSERT INTO deal_activities');
    expect(executed[0].query).toContain('INSERT INTO notifications');
    expect(executed[0].query).toContain('INSERT INTO outbox_events');
  });

  it('returns an existing deal after a duplicate insert conflict', async () => {
    db.executeResults.push([]);
    rowsByTable.deals = [
      {
        id: 31,
        listing_id: 8,
        buyer_id: 4,
        seller_id: 7,
        status: 'negotiating',
      },
    ];
    await expect(createDeal(4, 8)).resolves.toMatchObject({
      created: false,
      deal: { id: 31 },
    });
  });

  it('rejects unauthorised deal status changes and stale concurrent updates', async () => {
    rowsByTable.deals = [];
    await expect(
      updateDealStatus(31, 99, 'buyer', 'negotiating')
    ).rejects.toMatchObject({ status: 404 });
    rowsByTable.deals = [
      { id: 31, listing_id: 8, buyer_id: 4, seller_id: 7, status: 'proposed' },
    ];
    db.executeResults.push([]);
    await expect(
      updateDealStatus(31, 4, 'buyer', 'negotiating')
    ).rejects.toMatchObject({ status: 409, code: 'DEAL_STATUS_CHANGED' });
    expect(executed.at(-1).query).toContain('WHERE id = ? AND status = ?');
  });

  it('creates counteroffers as new rows and atomically supersedes the pending offer', async () => {
    rowsByTable.deals = [
      {
        id: 31,
        listing_id: 8,
        buyer_id: 4,
        seller_id: 7,
        status: 'negotiating',
      },
    ];
    rowsByTable.dealOffers = [
      { id: 50, deal_id: 31, created_by: 4, status: 'pending' },
    ];
    db.executeResults.push([
      {
        id: 51,
        deal_id: 31,
        parent_offer_id: 50,
        created_by: 7,
        status: 'pending',
      },
    ]);
    await expect(
      createOffer(31, 7, {
        amount: '90000',
        currency: 'EUR',
        parentOfferId: 50,
      })
    ).resolves.toMatchObject({ id: 51, parent_offer_id: 50 });
    expect(executed.at(-1).query).toContain('status = \'superseded\'');
    expect(executed.at(-1).query).toContain('parent_offer_id');
  });

  it('conditions offer response and withdrawal on pending state and participant identity', async () => {
    rowsByTable.deals = [
      {
        id: 31,
        listing_id: 8,
        buyer_id: 4,
        seller_id: 7,
        status: 'negotiating',
      },
    ];
    db.executeResults.push([
      { id: 50, deal_id: 31, created_by: 4, status: 'accepted' },
    ]);
    await respondToOffer(31, 50, 7, 'accept');
    expect(executed.at(-1).query).toContain('status = \'pending\'');
    expect(executed.at(-1).query).toContain('created_by <> ?');
    db.executeResults.push([
      { id: 52, deal_id: 31, created_by: 7, status: 'withdrawn' },
    ]);
    await withdrawOffer(31, 52, 7);
    expect(executed.at(-1).query).toContain('status = \'pending\'');
    expect(executed.at(-1).query).toContain('created_by = ?');
  });

  it('does not report acceptance when the locked deal transition fails', async () => {
    db.executeResults.push([]);
    await expect(respondToOffer(31, 50, 7, 'accept')).rejects.toMatchObject({
      status: 409,
      code: 'OFFER_NOT_RESPONDABLE',
    });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.executeResults).toHaveLength(0);
  });

  it('rejects an acceptance attempt by a user outside the deal participants', async () => {
    db.executeResults.push([]);
    await expect(respondToOffer(31, 50, 99, 'accept')).rejects.toMatchObject({
      status: 409,
      code: 'OFFER_NOT_RESPONDABLE',
    });
    expect(executed[0].query).toContain('? IN (buyer_id, seller_id)');
  });

  it('returns accepted offers only after the serialized deal update, with side effects in the same write', async () => {
    db.executeResults.push([
      { id: 50, deal_id: 31, created_by: 4, status: 'accepted' },
    ]);
    await expect(respondToOffer(31, 50, 7, 'accept')).resolves.toMatchObject({
      status: 'accepted',
    });
    const statement = executed[0].query;
    expect(statement.indexOf('deal_guard AS MATERIALIZED')).toBeLessThan(
      statement.indexOf('locked_offers AS MATERIALIZED')
    );
    expect(statement).toContain('ORDER BY offer.id');
    expect(statement).toContain('SET status = \'accepted\'');
    expect(statement).toContain('INSERT INTO deal_activities');
    expect(statement).toContain('INSERT INTO notifications');
    expect(statement).toContain('INSERT INTO outbox_events');
  });

  it('prevents ordinary status updates from accepting a deal without an accepted offer', async () => {
    rowsByTable.deals = [
      {
        id: 31,
        listing_id: 8,
        buyer_id: 4,
        seller_id: 7,
        status: 'negotiating',
      },
    ];
    await expect(
      updateDealStatus(31, 4, 'buyer', 'accepted')
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_DEAL_TRANSITION' });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('maps concurrent acceptance deadlocks and database constraint conflicts to retryable conflicts', async () => {
    const deadlock = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    db.execute.mockRejectedValueOnce(deadlock);
    await expect(respondToOffer(31, 50, 7, 'accept')).rejects.toMatchObject({
      status: 409,
      code: 'DEAL_CONFLICT',
    });
    const constraint = Object.assign(new Error('check constraint failed'), {
      code: '23514',
    });
    db.execute.mockRejectedValueOnce(constraint);
    await expect(createDeal(4, 8)).rejects.toMatchObject({
      status: 409,
      code: 'DEAL_CONFLICT',
    });
  });

  it('returns a conflict without offer or notification work when a counteroffer loses to deal closure', async () => {
    rowsByTable.deals = [
      {
        id: 31,
        listing_id: 8,
        buyer_id: 4,
        seller_id: 7,
        status: 'negotiating',
      },
    ];
    db.executeResults.push([]);
    await expect(
      createOffer(31, 7, {
        amount: '90000',
        currency: 'EUR',
        parentOfferId: 50,
      })
    ).rejects.toMatchObject({ status: 409, code: 'DEAL_NOT_NEGOTIATING' });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(executed[0].query).toContain('WITH deal_guard AS MATERIALIZED');
    expect(executed[0].query).toContain('FROM deal_guard');
  });

  it('returns rejected offers and performs their notification/outbox work in the same write', async () => {
    db.executeResults.push([
      { id: 50, deal_id: 31, created_by: 4, status: 'rejected' },
    ]);
    await expect(respondToOffer(31, 50, 7, 'reject')).resolves.toMatchObject({
      status: 'rejected',
    });
    expect(executed[0].query).toContain('INSERT INTO notifications');
    expect(executed[0].query).toContain('INSERT INTO outbox_events');
  });

  it('checks participant access before listing or downloading deal documents', async () => {
    rowsByTable.deals = [];
    await expect(
      listDealDocuments(31, 99, { page: 1, limit: 20 })
    ).rejects.toMatchObject({ status: 404 });
    await expect(getDealDocumentDownload(31, 90, 99)).rejects.toMatchObject({
      status: 404,
    });
    expect(downloadObject).not.toHaveBeenCalled();

    const dealRow = {
      id: 31,
      listing_id: 8,
      buyer_id: 4,
      seller_id: 7,
      status: 'negotiating',
    };
    db.selectResults.push(
      [dealRow],
      [
        {
          id: 90,
          filename: 'terms.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      ],
      [{ count: 1 }]
    );
    await expect(
      listDealDocuments(31, 4, { page: 1, limit: 20 })
    ).resolves.toMatchObject({
      documents: [{ id: 90 }],
      pagination: { total: 1 },
    });

    db.selectResults.push([dealRow]);
    db.selectResults.push([
      {
        id: 90,
        storage_key: 'private/key',
        original_filename: 'terms.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
      },
    ]);
    await expect(getDealDocumentDownload(31, 90, 4)).resolves.toMatchObject({
      row: { id: 90 },
    });
    expect(downloadObject).toHaveBeenCalledWith('private/key');
  });
});
