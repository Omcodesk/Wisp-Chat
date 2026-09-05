import { z } from "zod";

// Keep these limits centralized - referenced from both HTTP routes and the
// socket server so "what's a valid message" is defined in exactly one place.
export const TEXT_MESSAGE_MAX_LENGTH = 4000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB, see README security section
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const clientMessageIdSchema = z.string().uuid();

export const textMessageSchema = z.object({
  conversationId: z.string().cuid(),
  clientMessageId: clientMessageIdSchema,
  type: z.literal("TEXT"),
  content: z.string().trim().min(1).max(TEXT_MESSAGE_MAX_LENGTH),
});

export const mediaMessageSchema = z.object({
  conversationId: z.string().cuid(),
  clientMessageId: clientMessageIdSchema,
  type: z.enum(["GIF", "STICKER"]),
  mediaUrl: z.string().url(),
  mediaWidth: z.number().int().positive().max(4096).optional(),
  mediaHeight: z.number().int().positive().max(4096).optional(),
});

// IMAGE is deliberately excluded from the socket message:send schema - see
// types/index.ts for why (moderation cannot be enforced on that path).
export const messageSendSchema = z.discriminatedUnion("type", [
  textMessageSchema,
  mediaMessageSchema.extend({ type: z.literal("GIF") }),
  mediaMessageSchema.extend({ type: z.literal("STICKER") }),
]);

export const paginationQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export const uploadUrlRequestSchema = z.object({
  conversationId: z.string().cuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

export const uploadCompleteSchema = z.object({
  conversationId: z.string().cuid(),
  clientMessageId: clientMessageIdSchema,
  storageKey: z.string().min(1),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

export const gifSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
