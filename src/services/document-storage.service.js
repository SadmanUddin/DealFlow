// import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getEnvironment } from '#config/env.js';
import { AppError } from '#utils/app-error.js';

let adapter;
const getAdapter = () => {
  if (adapter) return adapter;
  const env = getEnvironment();
  if (env.DOCUMENT_STORAGE_DRIVER === 'mock') {
    throw new AppError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Document storage is not configured');
  }
  const client = new S3Client({
    region: env.R2_REGION,
    endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const storageError = () => new AppError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Document storage is temporarily unavailable');
  adapter = {
    async upload(key, body, contentType) {

      try {
    
        await new Upload({
    
          client,
    
          params: {
    
            Bucket: env.R2_BUCKET_NAME,
    
            Key: key,
    
            Body: body,
    
            ContentType: contentType,
    
          },
    
          queueSize: 1,
    
          partSize: 5 * 1024 * 1024,
    
          leavePartsOnError: false,
    
        }).done();
    
      } catch (error) {
    
        console.error('R2 upload diagnostic:', {
    
          name: error.name,
    
          code: error.Code ?? error.code,
    
          message: error.message,
    
          statusCode: error.$metadata?.httpStatusCode,
    
          requestId: error.$metadata?.requestId,
    
        });
    
        throw storageError();
    
      }
    
    },
    async download(key) {
      try { return (await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))).Body; }
      catch { throw storageError(); }
    },
    async remove(key) {
      try { await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })); }
      catch { throw storageError(); }
    },
  };
  return adapter;
};

export const setDocumentStorageAdapter = value => { adapter = value; };
export const uploadObject = (...args) => getAdapter().upload(...args);
export const downloadObject = (...args) => getAdapter().download(...args);
export const removeObject = (...args) => getAdapter().remove(...args);
