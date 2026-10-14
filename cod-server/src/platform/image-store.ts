import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredImage {
  body: Uint8Array;
  contentType: string;
  etag: string | null;
}

export interface OpenedImage {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  etag: string | null;
}

export interface ListedImage {
  key: string;
  size: number;
  uploaded: Date | null;
}

export interface ImageStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredImage | null>;
  open(key: string): Promise<OpenedImage | null>;
  delete(keys: string[]): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{ objects: ListedImage[]; cursor?: string }>;
}

export interface S3ImageStoreConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const DELETE_BATCH = 1000;

function isMissing(err: unknown): boolean {
  const { name, $metadata } = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err instanceof NoSuchKey || name === "NoSuchKey" || name === "NotFound" || $metadata?.httpStatusCode === 404;
}

export function s3ImageStore(config: S3ImageStoreConfig): ImageStore & { ensureBucket(): Promise<void> } {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  async function fetchObject(key: string) {
    try {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return object.Body ? object : null;
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (err) {
        if (!isMissing(err)) throw err;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, CacheControl: CACHE_CONTROL }));
    },
    async get(key) {
      const object = await fetchObject(key);
      if (!object) return null;
      return {
        body: await object.Body!.transformToByteArray(),
        contentType: object.ContentType ?? "application/octet-stream",
        etag: object.ETag ?? null,
      };
    },
    async open(key) {
      const object = await fetchObject(key);
      if (!object) return null;
      return {
        body: object.Body!.transformToWebStream(),
        contentType: object.ContentType ?? "application/octet-stream",
        etag: object.ETag ?? null,
      };
    },
    async delete(keys) {
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
      }
    },
    async list(prefix, cursor) {
      const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: cursor }));
      return {
        objects: (page.Contents ?? []).map((object) => ({
          key: object.Key!,
          size: object.Size ?? 0,
          uploaded: object.LastModified ?? null,
        })),
        cursor: page.IsTruncated ? page.NextContinuationToken : undefined,
      };
    },
  };
}

export function memoryImageStore(): ImageStore & { objects: Map<string, StoredImage & { uploaded: Date }> } {
  const objects = new Map<string, StoredImage & { uploaded: Date }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType, etag: `"${key.length}-${body.length}"`, uploaded: new Date() });
    },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: object.body, contentType: object.contentType, etag: object.etag } : null;
    },
    async open(key) {
      const object = objects.get(key);
      return object ? { body: new Blob([object.body as BlobPart]).stream(), contentType: object.contentType, etag: object.etag } : null;
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
    async list(prefix) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, object]) => ({ key, size: object.body.length, uploaded: object.uploaded })),
      };
    },
  };
}

export async function deleteImage(store: ImageStore, key: string): Promise<void> {
  const variants: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list(`${key}~`, cursor);
    variants.push(...page.objects.map((object) => object.key));
    cursor = page.cursor;
  } while (cursor);
  await store.delete([key, ...variants]);
}
