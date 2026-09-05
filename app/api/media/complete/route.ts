import { NextRequest, NextResponse } from "next/server";
import { MessageType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import { uploadCompleteSchema } from "@/lib/validation/schemas";
import { headObject, presignedGetUrl, copyToPublic, pendingKeyToPublicKey, publicUrlForKey, deleteObject, getFirstBytes, getObjectBuffer } from "@/lib/storage/r2";
import { matchesFileSignature } from "@/lib/validation/file-signature";
import { moderateImageBuffer } from "@/lib/moderation/image";
import { createMessageIdempotent, toMessageDTO } from "@/lib/db/messages";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/utils/api-error";

const INTERNAL_EMIT_SECRET = process.env.SOCKET_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL ?? "http://localhost:4001";

/**
 * POST /api/media/complete
 *
 * Step 2 of the image pipeline - this route is the enforcement point that
 * makes moderation non-bypassable (README "Image moderation"). It:
 *   1. re-authenticates + re-authorizes (never trust that upload-url's
 *      checks are still valid - re-verify)
 *   2. confirms the object actually exists in R2 at the size we expect
 *      (HeadObject) - a client can't claim success without a real upload
 *   3. downloads a small byte range and checks the real file signature,
 *      not just the declared Content-Type
 *   4. runs server-side image moderation against the *pending* (not yet
 *      public) object
 *   5. only on approval: copies the object to the public prefix, creates
 *      the Message row (idempotent), and pushes it to connected clients
 *   6. on rejection or any failure: deletes the pending object, creates NO
 *      message, and returns a generic error - the image is never visible
 *      to the recipient.
 *
 * There is no other path to create an IMAGE message - the socket server
 * explicitly rejects type: "IMAGE" (see server/socket.ts) - so this is the
 * only route capable of doing so, and it cannot skip step 4.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = uploadCompleteSchema.parse(await req.json());
    await assertConversationMember(user.id, body.conversationId);

    // Idempotency check: if this clientMessageId was already completed and
    // promoted, return the existing row immediately so retrying does not fail
    // with UPLOAD_NOT_FOUND (since the pending key was deleted on success).
    const existing = await prisma.message.findUnique({
      where: {
        idempotency_key: {
          conversationId: body.conversationId,
          senderId: user.id,
          clientMessageId: body.clientMessageId,
        },
      },
    });
    if (existing) {
      return NextResponse.json({ message: toMessageDTO(existing) });
    }

    if (!body.storageKey.startsWith(`pending/${body.conversationId}/`)) {
      return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Invalid upload reference." } }, { status: 400 });
    }

    // Step 2: confirm the object really exists and roughly matches what was
    // declared at presign time.
    const head = await headObject(body.storageKey).catch(() => null);
    if (!head || !head.ContentLength || head.ContentLength > body.sizeBytes + 1024) {
      return NextResponse.json({ error: { code: "UPLOAD_NOT_FOUND", message: "Upload could not be verified." } }, { status: 400 });
    }

    // Step 3: real file signature check.
    const firstBytes = await getFirstBytes(body.storageKey, 16);
    if (!matchesFileSignature(body.mimeType, firstBytes)) {
      await deleteObject(body.storageKey).catch(() => undefined);
      return NextResponse.json({ error: { code: "INVALID_FILE", message: "This doesn't look like a valid image file." } }, { status: 400 });
    }

    // Step 4: server-side moderation, executed against the pending object.
    const imageBuffer = await getObjectBuffer(body.storageKey);
    const moderation = await moderateImageBuffer(imageBuffer, body.mimeType);
    console.log("[moderation] image check", {
      userId: user.id,
      conversationId: body.conversationId,
      approved: moderation.approved,
      reason: moderation.reason,
      latencyMs: moderation.latencyMs,
    });

    if (!moderation.approved) {
      await deleteObject(body.storageKey).catch(() => undefined);
      // Deliberately generic - never leak moderation scores/internals to
      // the end user (README "Image moderation").
      return NextResponse.json(
        { error: { code: "MODERATION_REJECTED", message: "Image couldn't be approved right now. Please try again." } },
        { status: 422 }
      );
    }

    // Step 5: promote to public + persist message.
    const publicKey = pendingKeyToPublicKey(body.storageKey);
    await copyToPublic(body.storageKey, publicKey);
    await deleteObject(body.storageKey).catch(() => undefined);

    const { message } = await createMessageIdempotent({
      conversationId: body.conversationId,
      senderId: user.id,
      clientMessageId: body.clientMessageId,
      type: MessageType.IMAGE,
      mediaUrl: publicUrlForKey(publicKey),
      mediaMimeType: body.mimeType,
      mediaSize: body.sizeBytes,
    });

    // Push to connected clients via the socket server's internal endpoint.
    await fetch(`${SOCKET_SERVER_URL}/internal/emit-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_EMIT_SECRET },
      body: JSON.stringify({ conversationId: body.conversationId, message }),
    }).catch((err) => console.error("[media/complete] failed to notify socket server", err));

    return NextResponse.json({ message });
  } catch (err) {
    return handleApiError(err);
  }
}
