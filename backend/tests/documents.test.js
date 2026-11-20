import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Readable } from 'node:stream';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';
process.env.DOCUMENT_STORAGE_DRIVER = 'mock';

vi.mock('../src/config/database.js', async () => ({
  db: (await import('./helpers/mock-database.js')).db,
}));
vi.mock(
  '../src/models/user.model.js',
  async () => (await import('./helpers/mock-database.js')).modelTables
);
vi.mock('../src/models/listing.model.js', async () => ({
  businessListings: (await import('./helpers/mock-database.js')).modelTables
    .businessListings,
}));
vi.mock('../src/models/conversation.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return {
    conversations: modelTables.conversations,
    messages: modelTables.messages,
    conversationDocuments: modelTables.conversationDocuments,
  };
});
vi.mock('../src/config/arcjet.js', () => {
  const client = {
    withRule: () => client,
    protect: async () => ({ isDenied: () => false }),
  };
  return { default: client };
});
vi.mock('../src/config/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock(
  'drizzle-orm',
  async () => (await import('./helpers/mock-database.js')).drizzleOperators
);

const [{ default: app }, mock, storage] = await Promise.all([
  import('../src/app.js'),
  import('./helpers/mock-database.js'),
  import('../src/services/document-storage.service.js'),
]);
const password = 'A-strong-test-password-42';
const credentials = response => ({
  cookie: response.headers['set-cookie']
    .map(value => value.split(';')[0])
    .join('; '),
  csrf: response.body.csrfToken,
});
const signed = (builder, auth) =>
  builder.set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrf);
let buyer;
let seller;
let outsider;
let conversationId;
let stored;
let failStorageRemoval = false;
let failStorageUpload = false;
let failStorageDownload = false;
const createUser = async (role, email) =>
  credentials(
    await request(app)
      .post('/api/auth/sign-up')
      .send({ name: role, email, password, role })
  );

beforeEach(async () => {
  mock.resetDatabase();
  stored = new Map();
  storage.setDocumentStorageAdapter({
    upload: async (key, stream) => {
      if (failStorageUpload) throw new Error('storage unavailable');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      stored.set(key, Buffer.concat(chunks));
    },
    download: async key => {
      if (failStorageDownload) throw new Error('storage unavailable');
      return Readable.from(stored.get(key));
    },
    remove: async key => {
      if (failStorageRemoval) throw new Error('storage unavailable');
      stored.delete(key);
    },
  });
  buyer = await createUser('buyer', 'buyer@documents.test');
  seller = await createUser('seller', 'seller@documents.test');
  outsider = await createUser('buyer', 'outsider@documents.test');
  failStorageRemoval = false;
  failStorageUpload = false;
  failStorageDownload = false;
  const listing = await signed(request(app).post('/api/listings'), seller).send(
    {
      title: 'Business listing',
      description:
        'A sufficiently detailed business listing for due diligence.',
      currency: 'EUR',
    }
  );
  mock.databaseState.business_listings[0].status = 'published';
  const conversation = await signed(
    request(app).post('/api/conversations'),
    buyer
  ).send({ listingId: listing.body.listing.id });
  conversationId = conversation.body.conversation.id;
});

const upload = (auth, body = Buffer.from('%PDF-1.7\nfile data')) =>
  signed(
    request(app).post(`/api/conversations/${conversationId}/documents`),
    auth
  ).attach('file', body, {
    filename: 'deal.pdf',
    contentType: 'application/pdf',
  });

describe('conversation documents', () => {
  it('requires authentication, participant access, and CSRF for upload and delete', async () => {
    expect(
      (await request(app).get(`/api/conversations/${conversationId}/documents`))
        .status
    ).toBe(401);
    expect(
      (
        await signed(
          request(app).get(`/api/conversations/${conversationId}/documents`),
          outsider
        )
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/documents`)
          .attach('file', Buffer.from('%PDF-1.7'), 'a.pdf')
      ).status
    ).toBe(401);
    const noCsrf = await request(app)
      .post(`/api/conversations/${conversationId}/documents`)
      .set('Cookie', buyer.cookie)
      .attach('file', Buffer.from('%PDF-1.7'), 'a.pdf');
    expect(noCsrf.status).toBe(403);
  });

  it('streams and records valid PDF data with SHA-256, lists it, downloads safely, then soft deletes it', async () => {
    const created = await upload(buyer);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.document).toMatchObject({
      originalFilename: 'deal.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 18,
      uploaderId: 1,
    });
    expect(created.body.document).not.toHaveProperty('storage_key');
    expect(mock.databaseState.conversation_documents[0].sha256).toBe(
      '1c58373cdcad66e120b919ef9eee1052f89ab40db80a1d988407f22d9edfe0a9'
    );
    const docId = created.body.document.id;
    expect(
      (
        await request(app)
          .get(
            `/api/conversations/${conversationId}/documents/${docId}/download`
          )
          .set('Cookie', outsider.cookie)
      ).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).delete(
            `/api/conversations/${conversationId}/documents/${docId}`
          ),
          outsider
        )
      ).status
    ).toBe(404);
    const list = await request(app)
      .get(`/api/conversations/${conversationId}/documents`)
      .set('Cookie', seller.cookie);
    expect(list.body.documents).toHaveLength(1);
    const download = await request(app)
      .get(`/api/conversations/${conversationId}/documents/${docId}/download`)
      .set('Cookie', seller.cookie);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (
        await signed(
          request(app).delete(
            `/api/conversations/${conversationId}/documents/${docId}`
          ),
          seller
        )
      ).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).delete(
            `/api/conversations/${conversationId}/documents/${docId}`
          ),
          buyer
        )
      ).status
    ).toBe(204);
    expect(
      mock.databaseState.conversation_documents[0].deleted_at
    ).toBeTruthy();
    expect(
      (
        await request(app)
          .get(
            `/api/conversations/${conversationId}/documents/${docId}/download`
          )
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(404);
  });

  it('rejects unsupported or empty files and removes objects if metadata persistence fails', async () => {
    expect((await upload(buyer, Buffer.from('not a pdf'))).status).toBe(415);
    expect((await upload(buyer, Buffer.alloc(0))).status).toBe(415);
    mock.databaseState.failNext = new Error('database unavailable');
    mock.databaseState.failOn = {
      table: 'conversation_documents',
      operation: 'insert',
    };
    const response = await upload(buyer);
    expect(response.status).toBe(500);
    expect(stored.size).toBe(0);
  });

  it('handles storage upload and download failures safely and rejects a missing file field', async () => {
    failStorageUpload = true;
    expect((await upload(buyer)).status).toBe(500);
    failStorageUpload = false;
    const created = await upload(buyer);
    failStorageDownload = true;
    expect(
      (
        await request(app)
          .get(
            `/api/conversations/${conversationId}/documents/${created.body.document.id}/download`
          )
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(500);
    const missing = await signed(
      request(app).post(`/api/conversations/${conversationId}/documents`),
      buyer
    ).field('description', 'missing file');
    expect(missing.status).toBe(400);
  });

  it('accepts the other supported formats and validates office ZIP structure and CSV text', async () => {
    const docx = Buffer.from('PK\x03\x04word/document.xmlPK\x01\x02PK\x05\x06');
    const xlsx = Buffer.from('PK\x03\x04xl/workbook.xmlPK\x01\x02PK\x05\x06');
    for (const [buffer, filename] of [
      [docx, 'report.docx'],
      [xlsx, 'report.xlsx'],
      [Buffer.from('name,value\nDeal,100\n'), 'data.csv'],
    ]) {
      const response = await signed(
        request(app).post(`/api/conversations/${conversationId}/documents`),
        buyer
      ).attach('file', buffer, filename);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    }
    const malformedZip = await signed(
      request(app).post(`/api/conversations/${conversationId}/documents`),
      buyer
    ).attach('file', Buffer.from('PK\x03\x04not a document'), 'bad.docx');
    expect(malformedZip.status).toBe(415);
  });

  it('keeps failed object deletion inaccessible and exposes retryable cleanup state', async () => {
    const created = await upload(buyer);
    failStorageRemoval = true;
    const deletion = await signed(
      request(app).delete(
        `/api/conversations/${conversationId}/documents/${created.body.document.id}`
      ),
      buyer
    );
    expect(deletion.status).toBe(503);
    expect(mock.databaseState.conversation_documents[0]).toMatchObject({
      status: 'deletion_pending',
    });
    expect(
      mock.databaseState.conversation_documents[0].deleted_at
    ).toBeTruthy();
    expect(
      (
        await request(app)
          .get(`/api/conversations/${conversationId}/documents`)
          .set('Cookie', buyer.cookie)
      ).body.documents
    ).toHaveLength(0);
    expect(
      (
        await request(app)
          .get(
            `/api/conversations/${conversationId}/documents/${created.body.document.id}/download`
          )
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(404);
    failStorageRemoval = false;
    const { retryPendingDocumentCleanup } =
      await import('../src/services/document.service.js');
    expect(await retryPendingDocumentCleanup()).toEqual([
      { documentId: created.body.document.id, removed: true },
    ]);
    expect(mock.databaseState.conversation_documents[0].status).toBe('deleted');
  });

  it('rejects uploads larger than the configured 10 MB cap', async () => {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(10 * 1024 * 1024),
    ]);
    expect((await upload(buyer, bytes)).status).toBe(413);
  });

  it('filters unavailable rows and paginates available documents', async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await signed(
        request(app).post(`/api/conversations/${conversationId}/documents`),
        buyer
      ).attach(
        'file',
        Buffer.from(`%PDF-1.7\nfile ${index}`),
        `file-${index}.pdf`
      );
      expect(response.status).toBe(201);
    }
    mock.databaseState.conversation_documents.push(
      {
        ...mock.databaseState.conversation_documents[0],
        id: 40,
        storage_key: 'unavailable/pending',
        status: 'pending',
      },
      {
        ...mock.databaseState.conversation_documents[0],
        id: 41,
        storage_key: 'unavailable/rejected',
        status: 'rejected',
      },
      {
        ...mock.databaseState.conversation_documents[0],
        id: 42,
        storage_key: 'unavailable/deleted',
        deleted_at: new Date(),
      }
    );
    const page = await request(app)
      .get(`/api/conversations/${conversationId}/documents?page=1&limit=2`)
      .set('Cookie', seller.cookie);
    expect(page.body.documents).toHaveLength(2);
    expect(
      page.body.documents.every(document =>
        document.originalFilename.startsWith('file-')
      )
    ).toBe(true);
    expect(page.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });
});
