import { createHash, randomUUID } from 'node:crypto';
import Busboy from 'busboy';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '#config/database.js';
import { businessListings } from '#models/listing.model.js';
import { AppError } from '#utils/app-error.js';
import {
  downloadObject,
  removeObject,
  uploadObject,
} from '#services/document-storage.service.js';

const fail = (status, code, message) => new AppError(status, code, message);
const imageUrlFor = (listingId, updatedAt) =>
  `/api/listings/${listingId}/image?v=${updatedAt.getTime()}`;
const imageTypes = {
  'image/jpeg': buffer =>
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/png': buffer =>
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer =>
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP',
};

const readImage = req =>
  new Promise((resolve, reject) => {
    let parser;
    let fileCount = 0;
    let file = null;
    let tooLarge = false;
    let invalid = false;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 0, fileSize: 5 * 1024 * 1024 },
      });
    } catch {
      reject(
        fail(400, 'INVALID_MULTIPART', 'A listing image upload is required')
      );
      return;
    }
    parser.on('file', (field, stream, info) => {
      fileCount += 1;
      if (field !== 'image' || fileCount > 1) {
        invalid = true;
        stream.resume();
        return;
      }
      const chunks = [];
      stream.on('data', chunk => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.on('end', () => {
        file = { buffer: Buffer.concat(chunks), mimeType: info.mimeType };
      });
    });
    parser.on('filesLimit', () => {
      tooLarge = true;
    });
    parser.on('error', () =>
      reject(
        fail(
          400,
          'INVALID_MULTIPART',
          'The listing image upload could not be read'
        )
      )
    );
    parser.on('close', () => {
      if (tooLarge)
        return reject(
          fail(413, 'IMAGE_TOO_LARGE', 'Listing images must be 5 MB or smaller')
        );
      if (invalid)
        return reject(
          fail(400, 'INVALID_IMAGE', 'Upload one image using the image field')
        );
      if (!file || !imageTypes[file.mimeType]?.(file.buffer))
        return reject(
          fail(400, 'INVALID_IMAGE', 'Upload a valid JPEG, PNG, or WebP image')
        );
      resolve(file);
    });
    req.pipe(parser);
  });

export const uploadListingImage = async (req, listingId, sellerId) => {
  const [listing] = await db
    .select({
      imageKey: businessListings.image_key,
      status: businessListings.status,
    })
    .from(businessListings)
    .where(
      and(
        eq(businessListings.id, listingId),
        eq(businessListings.seller_id, sellerId)
      )
    )
    .limit(1);
  if (!listing)
    throw fail(404, 'LISTING_NOT_FOUND', 'Business listing was not found');
  if (!['draft', 'pending', 'rejected', 'published'].includes(listing.status))
    throw fail(
      409,
      'INVALID_LISTING_STATUS',
      'This listing cannot be edited in its current status'
    );
  const image = await readImage(req);
  const key = `listing-images/${sellerId}/${randomUUID()}`;
  await uploadObject(key, image.buffer, image.mimeType);
  let updatedRows;
  try {
    updatedRows = await db
      .update(businessListings)
      .set({
        image_key: key,
        image_mime_type: image.mimeType,
        ...(listing.status === 'published'
          ? { status: 'pending', published_at: null }
          : {}),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(businessListings.id, listingId),
          eq(businessListings.seller_id, sellerId),
          eq(businessListings.status, listing.status),
          listing.imageKey
            ? eq(businessListings.image_key, listing.imageKey)
            : isNull(businessListings.image_key)
        )
      )
      .returning({
        id: businessListings.id,
        status: businessListings.status,
        updatedAt: businessListings.updated_at,
      });
  } catch (error) {
    await removeObject(key).catch(() => {});
    throw error;
  }
  const [updated] = updatedRows;
  if (!updated) {
    await removeObject(key).catch(() => {});
    throw fail(
      409,
      'INVALID_LISTING_STATUS',
      'Listing status changed; reload and try again'
    );
  }
  if (listing.imageKey) await removeObject(listing.imageKey).catch(() => {});
  return {
    imageUrl: imageUrlFor(updated.id, updated.updatedAt),
    status: updated.status,
  };
};

export const removeListingImage = async (listingId, sellerId) => {
  const [listing] = await db
    .select({
      imageKey: businessListings.image_key,
      status: businessListings.status,
    })
    .from(businessListings)
    .where(
      and(
        eq(businessListings.id, listingId),
        eq(businessListings.seller_id, sellerId)
      )
    )
    .limit(1);
  if (!listing)
    throw fail(404, 'LISTING_NOT_FOUND', 'Business listing was not found');
  if (!['draft', 'pending', 'rejected', 'published'].includes(listing.status))
    throw fail(
      409,
      'INVALID_LISTING_STATUS',
      'This listing cannot be edited in its current status'
    );
  if (!listing.imageKey)
    return { removed: false, status: listing.status, imageUrl: null };

  const updatedAt = new Date();
  const [updated] = await db
    .update(businessListings)
    .set({
      image_key: null,
      image_mime_type: null,
      ...(listing.status === 'published'
        ? { status: 'pending', published_at: null }
        : {}),
      updated_at: updatedAt,
    })
    .where(
      and(
        eq(businessListings.id, listingId),
        eq(businessListings.seller_id, sellerId),
        eq(businessListings.status, listing.status),
        eq(businessListings.image_key, listing.imageKey)
      )
    )
    .returning({ status: businessListings.status });
  if (!updated)
    throw fail(
      409,
      'LISTING_CHANGED',
      'Listing changed while removing its image; reload and try again'
    );
  await removeObject(listing.imageKey).catch(() => {});
  return { removed: true, status: updated.status, imageUrl: null };
};

export const getListingImage = async (listingId, viewerId) => {
  const access = viewerId
    ? or(
      inArray(businessListings.status, ['published', 'sold']),
      and(
        eq(businessListings.seller_id, viewerId),
        inArray(businessListings.status, [
          'draft',
          'pending',
          'rejected',
          'published',
        ])
      )
    )
    : inArray(businessListings.status, ['published', 'sold']);
  const [listing] = await db
    .select({
      imageKey: businessListings.image_key,
      mimeType: businessListings.image_mime_type,
      status: businessListings.status,
    })
    .from(businessListings)
    .where(and(eq(businessListings.id, listingId), access))
    .limit(1);
  if (!listing?.imageKey)
    throw fail(404, 'LISTING_IMAGE_NOT_FOUND', 'Listing image was not found');
  const isPublic = ['published', 'sold'].includes(listing.status);
  return {
    loadStream: () => downloadObject(listing.imageKey),
    etag: isPublic
      ? `"${createHash('sha256').update(listing.imageKey).digest('hex')}"`
      : undefined,
    mimeType: listing.mimeType,
    isPublic,
  };
};
