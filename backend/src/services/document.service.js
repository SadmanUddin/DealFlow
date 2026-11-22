import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { TextDecoder } from 'node:util';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import Busboy from 'busboy';
import { db } from '#config/database.js';
import { conversationDocuments } from '#models/conversation.model.js';
import { getEnvironment } from '#config/env.js';
import { AppError } from '#utils/app-error.js';
import { getParticipantConversation } from '#services/conversation.service.js';
import {
  downloadObject,
  removeObject,
  uploadObject,
} from '#services/document-storage.service.js';
import { sanitizeFilename } from '#validations/document.validation.js';

const publicFields = {
  id: conversationDocuments.id,
  originalFilename: conversationDocuments.original_filename,
  mimeType: conversationDocuments.mime_type,
  sizeBytes: conversationDocuments.size_bytes,
  uploaderId: conversationDocuments.uploaded_by,
  createdAt: conversationDocuments.created_at,
};
const allowed = {
  '.pdf': {
    mime: 'application/pdf',
    magic: b => b.subarray(0, 5).toString() === '%PDF-',
  },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: b =>
      b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: b =>
      b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  '.csv': {
    mime: 'text/csv',
    magic: b => {
      try {
        const s = new TextDecoder('utf-8', { fatal: true }).decode(b);
        return !Array.from(s).some(character => {
          const code = character.codePointAt(0);
          return code < 32 && ![9, 10, 13].includes(code);
        });
      } catch {
        return false;
      }
    },
  },
};
const fail = (status, code, message) => new AppError(status, code, message);
const authorizedDocument = async (conversationId, documentId, userId) => {
  await getParticipantConversation(conversationId, userId);
  const [row] = await db
    .select()
    .from(conversationDocuments)
    .where(
      and(
        eq(conversationDocuments.id, documentId),
        eq(conversationDocuments.conversation_id, conversationId),
        eq(conversationDocuments.status, 'available'),
        isNull(conversationDocuments.deleted_at)
      )
    )
    .limit(1);
  if (!row) throw fail(404, 'DOCUMENT_NOT_FOUND', 'Document was not found');
  return row;
};

export const uploadConversationDocument = async (
  req,
  conversationId,
  userId
) => {
  await getParticipantConversation(conversationId, userId);
  const env = getEnvironment();
  return new Promise((resolve, reject) => {
    let fileStream;
    let filename;
    let extension;
    let mime;
    let size = 0;
    let signature = Buffer.alloc(0);
    let zipTail = Buffer.alloc(0);
    const csvDecoder = new TextDecoder('utf-8', { fatal: true });
    let tooLarge = false;
    let invalid = false;
    const hash = createHash('sha256');
    const key = `documents/${randomUUID()}`;
    let uploadPromise;
    let inspection;
    let completed = false;
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 0, fileSize: env.DOCUMENT_MAX_SIZE_BYTES },
      });
    } catch {
      reject(
        fail(400, 'INVALID_MULTIPART', 'A multipart file upload is required')
      );
      return;
    }
    parser.on('file', (field, stream, info) => {
      if (field !== 'file' || fileStream) {
        invalid = true;
        stream.resume();
        return;
      }
      fileStream = stream;
      filename = sanitizeFilename(info.filename);
      extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
      const spec = allowed[extension];
      if (!spec) invalid = true;
      mime = spec?.mime;
      inspection = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          hash.update(chunk);
          if (signature.length < 16)
            signature = Buffer.concat([signature, chunk]).subarray(0, 16);
          if (extension === '.docx' || extension === '.xlsx') {
            zipTail = Buffer.concat([zipTail, chunk]).subarray(-65557);
          }
          if (extension === '.csv') {
            try {
              const text = csvDecoder.decode(chunk, { stream: true });
              if (
                Array.from(text).some(character => {
                  const code = character.codePointAt(0);
                  return code < 32 && ![9, 10, 13].includes(code);
                })
              )
                invalid = true;
            } catch {
              invalid = true;
            }
          }
          if (size > env.DOCUMENT_MAX_SIZE_BYTES) tooLarge = true;
          if (size >= 16 && spec && !spec.magic(signature)) invalid = true;
          callback(null, chunk);
        },
        flush(callback) {
          if (extension === '.csv') {
            try {
              csvDecoder.decode();
            } catch {
              invalid = true;
            }
          }
          if (extension === '.docx' || extension === '.xlsx') {
            const marker =
              extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml';
            const zipEnd = zipTail.lastIndexOf(
              Buffer.from([0x50, 0x4b, 0x05, 0x06])
            );
            if (zipEnd < 0 || !zipTail.includes(Buffer.from(marker)))
              invalid = true;
          }
          callback();
        },
      });
      stream.on('limit', () => {
        tooLarge = true;
      });
      uploadPromise = uploadObject(
        key,
        stream.pipe(inspection),
        mime ?? 'application/octet-stream'
      );
      uploadPromise.catch(() => {});
    });
    parser.on('filesLimit', () => {
      invalid = true;
    });
    const cleanup = async () => {
      if (!uploadPromise) return;
      await uploadPromise.catch(() => {});
      await removeObject(key).catch(() => {});
    };
    const terminate = async () => {
      if (completed) return;
      completed = true;
      req.off('aborted', terminate);
      req.unpipe(parser);
      fileStream?.unpipe(inspection);
      inspection?.destroy();
      await cleanup();
      reject(
        fail(400, 'INVALID_MULTIPART', 'Multipart upload could not be parsed')
      );
    };
    parser.on('error', terminate);
    req.once('aborted', terminate);
    parser.on('close', async () => {
      if (completed) return;
      completed = true;
      req.off('aborted', terminate);
      try {
        if (!fileStream || !uploadPromise)
          throw fail(400, 'FILE_REQUIRED', 'A file field is required');
        await uploadPromise;
        if (tooLarge)
          throw fail(413, 'FILE_TOO_LARGE', 'File exceeds the 10 MB limit');
        if (invalid || size === 0 || !allowed[extension]?.magic(signature))
          throw fail(
            415,
            'UNSUPPORTED_FILE',
            'File type or content is not supported'
          );
        const checksum = hash.digest('hex');
        const status = env.DOCUMENT_QUARANTINE_REQUIRED
          ? 'pending'
          : 'available';
        const [row] = await db
          .insert(conversationDocuments)
          .values({
            conversation_id: conversationId,
            uploaded_by: userId,
            storage_key: key,
            original_filename: filename,
            mime_type: mime,
            size_bytes: size,
            sha256: checksum,
            status,
          })
          .returning(publicFields);
        resolve({ document: { ...row, status } });
      } catch (error) {
        await cleanup();
        reject(error);
      }
    });
    req.pipe(parser);
  });
};

export const listConversationDocuments = async (
  conversationId,
  userId,
  { page, limit }
) => {
  await getParticipantConversation(conversationId, userId);
  const where = and(
    eq(conversationDocuments.conversation_id, conversationId),
    eq(conversationDocuments.status, 'available'),
    isNull(conversationDocuments.deleted_at)
  );
  const [documents, counts] = await Promise.all([
    db
      .select(publicFields)
      .from(conversationDocuments)
      .where(where)
      .orderBy(
        desc(conversationDocuments.created_at),
        desc(conversationDocuments.id)
      )
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql`count(*)::int` })
      .from(conversationDocuments)
      .where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return {
    documents,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getConversationDocumentDownload = async (
  conversationId,
  documentId,
  userId
) => {
  const row = await authorizedDocument(conversationId, documentId, userId);
  return { row, stream: await downloadObject(row.storage_key) };
};

export const deleteConversationDocument = async (
  conversationId,
  documentId,
  userId
) => {
  await getParticipantConversation(conversationId, userId);
  const [row] = await db
    .select()
    .from(conversationDocuments)
    .where(
      and(
        eq(conversationDocuments.id, documentId),
        eq(conversationDocuments.conversation_id, conversationId),
        eq(conversationDocuments.uploaded_by, userId),
        isNull(conversationDocuments.deleted_at)
      )
    )
    .limit(1);
  if (!row) throw fail(404, 'DOCUMENT_NOT_FOUND', 'Document was not found');
  await db
    .update(conversationDocuments)
    .set({
      status: 'deletion_pending',
      deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(conversationDocuments.id, documentId));
  try {
    await removeObject(row.storage_key);
    await db
      .update(conversationDocuments)
      .set({ status: 'deleted', updated_at: new Date() })
      .where(eq(conversationDocuments.id, documentId));
  } catch {
    throw fail(
      503,
      'DOCUMENT_CLEANUP_PENDING',
      'Document was deleted and storage cleanup will be retried'
    );
  }
};

export const retryPendingDocumentCleanup = async (limit = 50) => {
  const rows = await db
    .select()
    .from(conversationDocuments)
    .where(eq(conversationDocuments.status, 'deletion_pending'))
    .limit(limit);
  const results = await Promise.all(
    rows.map(async row => {
      try {
        await removeObject(row.storage_key);
        await db
          .update(conversationDocuments)
          .set({ status: 'deleted', updated_at: new Date() })
          .where(eq(conversationDocuments.id, row.id));
        return { documentId: row.id, removed: true };
      } catch {
        return { documentId: row.id, removed: false };
      }
    })
  );
  return results;
};
