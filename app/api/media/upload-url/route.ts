import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import { uploadUrlRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation/schemas";
import { checkRateLimit, uploadRateLimit } from "@/lib/rate-limit";
import { generatePendingStorageKey, createPresignedUploadUrl, isStorageConfigured } from "@/lib/storage/r2";
import { handleApiError, rateLimitedResponse } from "@/lib/utils/api-error";

/**
 * POST /api/media/upload-url
 * Step 1 of the image pipeline (see README "Media / moderation
 * architecture"). Validates the request metadata, checks conversation
 * membership, rate limits, and returns a short-lived presigned PUT URL to
 * a `pending/` key that WE generated (never the client's filename). The
 * uploaded object is not yet linked to any message and is not moderated
 * or public at this point.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = uploadUrlRequestSchema.parse(await req.json());

    await assertConversationMember(user.id, body.conversationId);

    const rl = await checkRateLimit(uploadRateLimit, user.id);
    if (!rl.allowed) return rateLimitedResponse(rl.resetAt);



    if (body.sizeBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE", message: "Images must be 10 MB or smaller." } }, { status: 413 });
    }

    const storageKey = generatePendingStorageKey(body.conversationId, body.mimeType);
    const uploadUrl = await createPresignedUploadUrl(storageKey, body.mimeType, body.sizeBytes);

    return NextResponse.json({ uploadUrl, storageKey, expiresInSeconds: 300 });
  } catch (err) {
    return handleApiError(err);
  }
}
