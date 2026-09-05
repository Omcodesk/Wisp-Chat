import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

/**
 * All storage access goes through this module.
 * - When Cloudflare R2 credentials (R2_*) are provided, it uses S3/R2 storage.
 * - When R2 is not configured, it seamlessly uses secure local storage (public/uploads/)
 *   so image uploading works out of the box without requiring any payment method or credit card.
 */
function getClient(): S3Client {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    !process.env.R2_ACCOUNT_ID.includes("your-")
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.includes("your-")) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function generatePendingStorageKey(conversationId: string, mimeType: string): string {
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  return `pending/${conversationId}/${randomUUID()}.${ext}`;
}

export function pendingKeyToPublicKey(pendingKey: string): string {
  return pendingKey.replace(/^pending\//, "messages/");
}

function getLocalUploadPath(key: string): string {
  return path.join(process.cwd(), "public", "uploads", key);
}

export async function createPresignedUploadUrl(key: string, mimeType: string, maxSizeBytes: number): Promise<string> {
  if (isStorageConfigured()) {
    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: key,
      ContentType: mimeType,
      ContentLength: maxSizeBytes,
    });
    return getSignedUrl(client, command, { expiresIn: 300 });
  }

  // Local storage fallback: direct PUT endpoint (requires no payment or external accounts)
  return `/api/media/upload-direct?key=${encodeURIComponent(key)}`;
}

export async function headObject(key: string): Promise<{ ContentLength?: number }> {
  if (isStorageConfigured()) {
    const client = getClient();
    return client.send(new HeadObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key }));
  }

  const localPath = getLocalUploadPath(key);
  if (!fs.existsSync(localPath)) {
    throw new Error("File not found on local disk");
  }
  const stat = fs.statSync(localPath);
  return { ContentLength: stat.size };
}

export async function copyToPublic(pendingKey: string, publicKey: string): Promise<void> {
  if (isStorageConfigured()) {
    const client = getClient();
    const bucket = requireEnv("R2_BUCKET_NAME");
    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${pendingKey}`,
        Key: publicKey,
      })
    );
    return;
  }

  const sourcePath = getLocalUploadPath(pendingKey);
  const destPath = getLocalUploadPath(publicKey);
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(sourcePath, destPath);
}

export async function deleteObject(key: string): Promise<void> {
  if (isStorageConfigured()) {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key }));
    return;
  }

  const localPath = getLocalUploadPath(key);
  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
    } catch {
      // Ignore if already deleted
    }
  }
}

export function publicUrlForKey(key: string): string {
  if (isStorageConfigured()) {
    const base = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
    return `${base}/${key}`;
  }

  // Local URL served by Next.js from public/uploads
  return `/uploads/${key}`;
}

export async function presignedGetUrl(key: string): Promise<string> {
  if (isStorageConfigured()) {
    const client = getClient();
    const command = new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key });
    return getSignedUrl(client, command, { expiresIn: 300 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/uploads/${key}`;
}

export async function getFirstBytes(key: string, numBytes: number = 16): Promise<Uint8Array> {
  if (isStorageConfigured()) {
    const getUrl = await presignedGetUrl(key);
    const rangeRes = await fetch(getUrl, { headers: { Range: `bytes=0-${numBytes - 1}` } });
    return new Uint8Array(await rangeRes.arrayBuffer());
  }

  const localPath = getLocalUploadPath(key);
  const fd = fs.openSync(localPath, "r");
  const buffer = Buffer.alloc(numBytes);
  fs.readSync(fd, buffer, 0, numBytes, 0);
  fs.closeSync(fd);
  return new Uint8Array(buffer);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (isStorageConfigured()) {
    const client = getClient();
    const command = new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key });
    const res = await client.send(command);
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  const localPath = getLocalUploadPath(key);
  return fs.readFileSync(localPath);
}

