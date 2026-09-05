import { io } from "socket.io-client";
import { encode } from "next-auth/jwt";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db/prisma";
import { matchesFileSignature } from "../lib/validation/file-signature";
import { moderateImageUrl } from "../lib/moderation/image";
import { toMessageDTO } from "../lib/db/messages";
import { MessageType } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SECRET || "longrandomsecretforwispchatapp12345678901234567890";
const SOCKET_URL = "http://localhost:4001";
const APP_URL = "http://localhost:3000";

async function createAuthCookie(user: { id: string; name: string; email: string }) {
  const token = await encode({
    token: { userId: user.id, name: user.name, email: user.email },
    secret: AUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  });
  return `next-auth.session-token=${token}`;
}

async function runIntegrationsVerification() {
  console.log("=== VERIFYING EXTERNAL INTEGRATIONS & SECURITY CONSTRAINTS ===");

  const user1 = await prisma.user.findUnique({ where: { email: "demo1@example.com" } });
  const user2 = await prisma.user.findUnique({ where: { email: "demo2@example.com" } });
  if (!user1 || !user2) throw new Error("Demo users not found");

  const conversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId: user1.id } } },
        { members: { some: { userId: user2.id } } },
      ],
    },
  });
  if (!conversation) throw new Error("Conversation not found");

  const cookie1 = await createAuthCookie(user1);
  const cookie2 = await createAuthCookie(user2);

  // -------------------------------------------------------------------------
  // 1. Confirm socket cannot bypass the image moderation pipeline
  // -------------------------------------------------------------------------
  console.log("\n1. Testing: Can socket bypass image moderation pipeline?");
  const socket = io(SOCKET_URL, {
    extraHeaders: { cookie: cookie1 },
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((res) => socket.on("connect", () => res()));

  const bypassAttemptAck = await new Promise<any>((resolve) => {
    socket.emit(
      "message:send",
      {
        conversationId: conversation.id,
        clientMessageId: randomUUID(),
        type: "IMAGE" as any,
        content: null,
        mediaUrl: "https://example.com/unmoderated.jpg",
      },
      resolve
    );
  });

  if (bypassAttemptAck.ok || bypassAttemptAck.code !== "INVALID_PAYLOAD") {
    throw new Error(`Socket allowed or did not reject IMAGE send attempt! Got: ${JSON.stringify(bypassAttemptAck)}`);
  }
  console.log("✔ PASS: Socket explicitly rejects type: 'IMAGE' with INVALID_PAYLOAD. Moderation cannot be bypassed via socket.");
  socket.disconnect();

  // -------------------------------------------------------------------------
  // 2. File Signature & Magic Bytes Validation
  // -------------------------------------------------------------------------
  console.log("\n2. Testing: Magic-byte and file signature verification");
  // Valid JPEG header
  const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  // Valid PNG header
  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Valid WebP header
  const validWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  // Malicious/fake text file disguised as JPEG
  const fakeJpeg = new Uint8Array(Buffer.from("This is plain text with .jpg extension"));

  if (!matchesFileSignature("image/jpeg", validJpeg)) throw new Error("Valid JPEG rejected");
  if (!matchesFileSignature("image/png", validPng)) throw new Error("Valid PNG rejected");
  if (!matchesFileSignature("image/webp", validWebp)) throw new Error("Valid WebP rejected");
  if (matchesFileSignature("image/jpeg", fakeJpeg)) throw new Error("Fake JPEG accepted");
  console.log("✔ PASS: Magic-byte file signature validation correctly accepts valid JPEG/PNG/WebP and rejects disguised files.");

  // -------------------------------------------------------------------------
  // 3. Sightengine Fail-Closed Policy
  // -------------------------------------------------------------------------
  console.log("\n3. Testing: Sightengine server-side moderation fail-closed behavior");
  const modResult = await moderateImageUrl("https://example.com/test.jpg");
  if (modResult.approved) {
    throw new Error("Moderation approved when credentials were not configured! Must fail closed.");
  }
  console.log("✔ PASS: Moderation fails closed (approved: false, reason: provider_unavailable). Unmoderated images can never reach recipient.");

  // -------------------------------------------------------------------------
  // 4. Complete Image Flow Idempotency on /api/media/complete
  // -------------------------------------------------------------------------
  console.log("\n4. Testing: /api/media/complete idempotency on retry");
  const testClientMsgId = randomUUID();
  // Simulate an already-persisted image message
  const created = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user1.id,
      clientMessageId: testClientMsgId,
      type: MessageType.IMAGE,
      mediaUrl: "https://pub-example.r2.dev/messages/test.jpg",
      mediaMimeType: "image/jpeg",
      mediaSize: 12345,
    },
  });

  // Call /api/media/complete endpoint with cookie
  const completeRes = await fetch(`${APP_URL}/api/media/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie1,
    },
    body: JSON.stringify({
      conversationId: conversation.id,
      clientMessageId: testClientMsgId,
      storageKey: `pending/${conversation.id}/deleted-key.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 12345,
    }),
  });

  if (!completeRes.ok) {
    const errText = await completeRes.text();
    throw new Error(`/api/media/complete retry failed with status ${completeRes.status}: ${errText}`);
  }
  const completeJson = await completeRes.json();
  if (completeJson.message.clientMessageId !== testClientMsgId || completeJson.message.id !== created.id) {
    throw new Error(`Idempotency returned incorrect message: ${JSON.stringify(completeJson)}`);
  }

  // Verify no duplicate row was created
  const rowCount = await prisma.message.count({
    where: { conversationId: conversation.id, clientMessageId: testClientMsgId },
  });
  if (rowCount !== 1) {
    throw new Error(`Duplicate rows created! Expected 1, got ${rowCount}`);
  }
  console.log("✔ PASS: Retried /api/media/complete returned existing message with 200 OK without creating duplicate rows.");

  // Cleanup test message
  await prisma.message.delete({ where: { id: created.id } }).catch(() => undefined);

  // -------------------------------------------------------------------------
  // 5. Check Environment Credentials Status
  // -------------------------------------------------------------------------
  console.log("\n5. Checking external service credentials configured:");
  const hasGiphy = Boolean(process.env.GIPHY_API_KEY && !process.env.GIPHY_API_KEY.includes("your-"));
  const hasR2 = Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    !process.env.R2_ACCOUNT_ID.includes("your-")
  );
  const hasSightengine = Boolean(
    process.env.SIGHTENGINE_API_USER &&
    process.env.SIGHTENGINE_API_SECRET &&
    !process.env.SIGHTENGINE_API_USER.includes("your-")
  );

  console.log(`- GIPHY_API_KEY: ${hasGiphy ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`- Cloudflare R2: ${hasR2 ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`- Sightengine: ${hasSightengine ? "CONFIGURED" : "NOT CONFIGURED"}`);

  console.log("\n=== ALL INTEGRATION & SECURITY ASSERTIONS COMPLETED ===");
}

runIntegrationsVerification()
  .catch((e) => {
    console.error("❌ INTEGRATION TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
