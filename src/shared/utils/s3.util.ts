import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '../utils/logger.util';

const MODULE = 'S3_UTIL';

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

let cachedClient: S3Client | null = null;

export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const region = requireEnv('AWS_REGION');
  // Credentials are picked from env by default: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  cachedClient = new S3Client({ region });
  Logger.info(MODULE, 'S3 client initialized', { region });
  return cachedClient;
}

export async function getPresignedPutUrl(params: {
  bucket: string;
  key: string;
  contentType: string;
  expiresSeconds?: number; // default 300s
  acl?: 'private' | 'public-read';
}): Promise<{ url: string; headers: Record<string, string> }> {
  const { bucket, key, contentType, expiresSeconds = 300, acl = 'private' } = params;
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ACL: acl
  } as any);

  const url = await getSignedUrl(client, command, { expiresIn: expiresSeconds });
  return {
    url,
    headers: {
      'Content-Type': contentType
    }
  };
}

export function getPublicUrlForKey(key: string): string {
  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/${key}`;
}


