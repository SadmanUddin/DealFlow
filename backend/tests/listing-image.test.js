import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, uploadObject, removeObject, downloadObject } = vi.hoisted(() => ({
  db: {
    selectResults: [],
    updateResults: [],
    updateValues: [],
    select: vi.fn(),
    update: vi.fn(),
  },
  uploadObject: vi.fn(),
  removeObject: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock('#config/database.js', () => ({ db }));
vi.mock('#services/document-storage.service.js', () => ({
  uploadObject,
  removeObject,
  downloadObject,
}));
vi.mock('#models/listing.model.js', () => ({
  businessListings: Object.fromEntries(
    [
      'id',
      'seller_id',
      'image_key',
      'image_mime_type',
      'status',
      'published_at',
      'updated_at',
    ].map(field => [field, { field }])
  ),
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...values) => values),
  sql: (parts, ...values) => ({ parts, values }),
  eq: vi.fn((...values) => values),
  inArray: vi.fn((...values) => values),
  isNull: vi.fn(value => value),
  or: vi.fn((...values) => values),
}));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function imageRequest() {
  const boundary = 'dealflow-test-boundary';
  const body = Buffer.concat([
    Buffer.from(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="image"; filename="listing.png"\r\nContent-Type: image/png\r\n\r\n'
    ),
    png,
    Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);
  const request = Readable.from([body]);
  request.headers = {
    'content-type': 'multipart/form-data; boundary=' + boundary,
  };
  return request;
}

function makeSelectQuery() {
  return {
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(db.selectResults.shift() ?? []).then(
        resolve,
        reject
      );
    },
  };
}

function makeUpdateQuery() {
  return {
    set(values) {
      db.updateValues.push(values);
      return this;
    },
    where() {
      return this;
    },
    returning() {
      return Promise.resolve(db.updateResults.shift() ?? []);
    },
  };
}

describe('listing image lifecycle with mocked database and storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.selectResults = [];
    db.updateResults = [];
    db.updateValues = [];
    db.select.mockImplementation(makeSelectQuery);
    db.update.mockImplementation(makeUpdateQuery);
    uploadObject.mockResolvedValue(undefined);
    removeObject.mockResolvedValue(undefined);
  });

  it('moves a published listing to pending when uploading a replacement and uses an opaque image prefix', async () => {
    const updatedAt = new Date('2026-11-21T12:00:00.000Z');
    db.selectResults.push([
      { imageKey: 'listing-images/4/old', status: 'published' },
    ]);
    db.updateResults.push([{ id: 12, status: 'pending', updatedAt }]);
    const { uploadListingImage } =
      await import('../src/services/listing-image.service.js');

    const result = await uploadListingImage(imageRequest(), 12, 4);

    expect(uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^listing-images\/4\/[0-9a-f-]+$/i),
      png,
      'image/png'
    );
    expect(db.updateValues[0]).toMatchObject({
      image_mime_type: 'image/png',
      status: 'pending',
      published_at: null,
    });
    expect(result).toEqual({
      imageUrl: '/api/listings/12/image?v=' + updatedAt.getTime(),
      status: 'pending',
    });
    expect(removeObject).toHaveBeenCalledWith('listing-images/4/old');
  });

  it('allows replacing an image while already pending without publishing the listing', async () => {
    db.selectResults.push([
      { imageKey: 'listing-images/4/current', status: 'pending' },
    ]);
    db.updateResults.push([
      {
        id: 12,
        status: 'pending',
        updatedAt: new Date('2026-11-21T12:00:00Z'),
      },
    ]);
    const { uploadListingImage } =
      await import('../src/services/listing-image.service.js');

    const result = await uploadListingImage(imageRequest(), 12, 4);

    expect(db.updateValues[0].status).toBeUndefined();
    expect(result.status).toBe('pending');
  });

  it('removes an image while pending without changing the moderation status', async () => {
    db.selectResults.push([
      { imageKey: 'listing-images/4/pending-image', status: 'pending' },
    ]);
    db.updateResults.push([{ status: 'pending' }]);
    const { removeListingImage } =
      await import('../src/services/listing-image.service.js');

    await expect(removeListingImage(12, 4)).resolves.toEqual({
      removed: true,
      status: 'pending',
      imageUrl: null,
    });
    expect(db.updateValues[0]).toMatchObject({
      image_key: null,
      image_mime_type: null,
    });
    expect(db.updateValues[0].status).toBeUndefined();
    expect(removeObject).toHaveBeenCalledWith('listing-images/4/pending-image');
  });

  it('streams a published image only through the image service and keeps object keys private', async () => {
    const stream = { privateObject: true };
    db.selectResults.push([
      {
        imageKey: 'listing-images/4/private-key',
        mimeType: 'image/png',
        status: 'published',
      },
    ]);
    downloadObject.mockResolvedValue(stream);
    const { getListingImage } =
      await import('../src/services/listing-image.service.js');

    await expect(getListingImage(12, null)).resolves.toEqual({
      stream,
      mimeType: 'image/png',
      isPublic: true,
    });
    expect(downloadObject).toHaveBeenCalledWith('listing-images/4/private-key');
  });

  it('sets cross-origin response policy only after image authorization and keeps published caching', async () => {
    const stream = { on: vi.fn(), pipe: vi.fn() };
    db.selectResults.push([
      {
        imageKey: 'listing-images/4/private-key',
        mimeType: 'image/png',
        status: 'published',
      },
    ]);
    downloadObject.mockResolvedValue(stream);
    const { getListingImageController } =
      await import('../src/controllers/listing.controller.js');
    const response = { set: vi.fn(), destroy: vi.fn(), headersSent: false };

    await getListingImageController(
      { params: { id: '12' }, user: undefined },
      response
    );

    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'public, max-age=300',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Type': 'image/png',
      })
    );
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });
});
