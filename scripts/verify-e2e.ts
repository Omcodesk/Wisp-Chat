import { io, Socket } from "socket.io-client";
import { encode } from "next-auth/jwt";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db/prisma";

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

function createSocket(cookieHeader: string): Socket {
  return io(SOCKET_URL, {
    extraHeaders: {
      cookie: cookieHeader,
    },
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitEvent<T = any>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runVerification() {
  console.log("=== STARTING END-TO-END RUNTIME VERIFICATION ===");

  const user1 = await prisma.user.findUnique({ where: { email: "demo1@example.com" } });
  const user2 = await prisma.user.findUnique({ where: { email: "demo2@example.com" } });
  const user3 = await prisma.user.findUnique({ where: { email: "demo3@example.com" } });

  if (!user1 || !user2 || !user3) {
    throw new Error("Seeded users demo1, demo2, demo3 not found in database!");
  }
  console.log("✔ Found seeded demo users in database");

  const conversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId: user1.id } } },
        { members: { some: { userId: user2.id } } },
      ],
    },
  });

  if (!conversation) {
    throw new Error("Conversation between demo1 and demo2 not found!");
  }
  console.log(`✔ Found conversation between demo1 and demo2: ${conversation.id}`);

  // 1. Authenticate both users via JWT session tokens
  const cookie1 = await createAuthCookie(user1);
  const cookie2 = await createAuthCookie(user2);
  const cookie3 = await createAuthCookie(user3);

  // 2. Connect sockets
  console.log("\n--- Testing Socket.IO Handshake & Authentication ---");
  const socket1 = createSocket(cookie1);
  const socket2 = createSocket(cookie2);

  await Promise.all([
    new Promise<void>((resolve) => socket1.on("connect", () => resolve())),
    new Promise<void>((resolve) => socket2.on("connect", () => resolve())),
  ]);
  console.log("✔ Sockets connected successfully for demo1 and demo2 with session cookies");

  // 3. Test Join Conversation
  console.log("\n--- Testing Conversation Join & Authorization ---");
  const join1 = await new Promise<{ ok: boolean }>((res) =>
    socket1.emit("conversation:join", { conversationId: conversation.id }, res)
  );
  const join2 = await new Promise<{ ok: boolean }>((res) =>
    socket2.emit("conversation:join", { conversationId: conversation.id }, res)
  );
  if (!join1.ok || !join2.ok) {
    throw new Error(`Failed to join conversation: ${JSON.stringify({ join1, join2 })}`);
  }
  console.log("✔ Both demo1 and demo2 successfully joined conversation room");

  // Test unauthorized join
  const socket3 = createSocket(cookie3);
  await new Promise<void>((resolve) => socket3.on("connect", () => resolve()));
  const join3 = await new Promise<{ ok: boolean; code?: string }>((res) =>
    socket3.emit("conversation:join", { conversationId: conversation.id }, res)
  );
  if (join3.ok || join3.code !== "FORBIDDEN") {
    throw new Error(`Expected FORBIDDEN for demo3 joining unauthorized conversation, got ${JSON.stringify(join3)}`);
  }
  console.log("✔ Unauthorized access correctly rejected with FORBIDDEN for demo3");
  socket3.disconnect();

  // 4. Test Typing Indicators
  console.log("\n--- Testing Typing Indicators in Realtime ---");
  const typingPromise = waitEvent(socket2, "typing:start");
  socket1.emit("typing:start", { conversationId: conversation.id });
  const typingEvent = await typingPromise;
  if (typingEvent.conversationId !== conversation.id || typingEvent.userId !== user1.id) {
    throw new Error(`Typing start event mismatch: ${JSON.stringify(typingEvent)}`);
  }
  console.log("✔ demo1 typing:start received by demo2 in realtime");

  const stopTypingPromise = waitEvent(socket2, "typing:stop");
  socket1.emit("typing:stop", { conversationId: conversation.id });
  const stopTypingEvent = await stopTypingPromise;
  if (stopTypingEvent.conversationId !== conversation.id || stopTypingEvent.userId !== user1.id) {
    throw new Error(`Typing stop event mismatch: ${JSON.stringify(stopTypingEvent)}`);
  }
  console.log("✔ demo1 typing:stop received by demo2 in realtime");

  // 5. Test Realtime Message Delivery (Sent -> Delivered)
  console.log("\n--- Testing Realtime Message Delivery & Status Transitions ---");
  const testMsgId = randomUUID();
  const msgPromise = waitEvent(socket2, "message:new");

  const ack = await new Promise<any>((resolve) => {
    socket1.emit(
      "message:send",
      {
        conversationId: conversation.id,
        clientMessageId: testMsgId,
        type: "TEXT",
        content: "Hello from demo1 e2e test!",
      },
      resolve
    );
  });

  if (!ack.ok) {
    throw new Error(`message:send failed: ${JSON.stringify(ack)}`);
  }
  console.log("✔ message:send acknowledged with server id:", ack.message.id);
  if (!ack.message.deliveredAt) {
    throw new Error("Message should be marked delivered because demo2 was online and connected!");
  }
  console.log("✔ Message immediately marked deliveredAt:", ack.message.deliveredAt);

  const receivedMsg = await msgPromise;
  if (receivedMsg.clientMessageId !== testMsgId) {
    throw new Error(`Received message ID mismatch: expected ${testMsgId}, got ${receivedMsg.clientMessageId}`);
  }
  console.log("✔ demo2 received message:new in realtime without refresh");

  // 6. Test Read Status Transition
  console.log("\n--- Testing Read Status (message:read) ---");
  const readPromise = waitEvent(socket1, "message:read");
  socket2.emit("message:read", { conversationId: conversation.id, upToMessageId: ack.message.id });
  const readNotification = await readPromise;
  if (readNotification.readerId !== user2.id || readNotification.conversationId !== conversation.id) {
    throw new Error(`Invalid read notification: ${JSON.stringify(readNotification)}`);
  }
  console.log("✔ demo2 marked conversation as read; demo1 received message:read notification");

  // 7. Test Idempotency with Duplicate clientMessageId
  console.log("\n--- Testing clientMessageId Idempotency ---");
  const initialCount = await prisma.message.count({
    where: { conversationId: conversation.id, clientMessageId: testMsgId },
  });
  if (initialCount !== 1) {
    throw new Error(`Expected 1 message with clientMessageId ${testMsgId}, found ${initialCount}`);
  }

  const dupAck = await new Promise<any>((resolve) => {
    socket1.emit(
      "message:send",
      {
        conversationId: conversation.id,
        clientMessageId: testMsgId,
        type: "TEXT",
        content: "Duplicate send attempt",
      },
      resolve
    );
  });

  if (!dupAck.ok) {
    throw new Error(`Duplicate send should be acknowledged ok: ${JSON.stringify(dupAck)}`);
  }
  const afterCount = await prisma.message.count({
    where: { conversationId: conversation.id, clientMessageId: testMsgId },
  });
  if (afterCount !== 1) {
    throw new Error(`Idempotency violated! Duplicate row created. Expected 1, found ${afterCount}`);
  }
  console.log("✔ Re-sending identical clientMessageId did not create duplicate database rows");

  // 8. Test Profanity Moderation
  console.log("\n--- Testing Profanity Moderation ---");
  const profanityAck = await new Promise<any>((resolve) => {
    socket1.emit(
      "message:send",
      {
        conversationId: conversation.id,
        clientMessageId: randomUUID(),
        type: "TEXT",
        content: "This contains badword: shit and asshole",
      },
      resolve
    );
  });
  if (profanityAck.ok || profanityAck.code !== "MODERATION_BLOCKED") {
    throw new Error(`Expected MODERATION_BLOCKED, got: ${JSON.stringify(profanityAck)}`);
  }
  console.log("✔ Profane message rejected with MODERATION_BLOCKED:", profanityAck.message);

  // 9. Test Multi-tab Presence
  console.log("\n--- Testing Multi-tab Presence Tracking ---");
  const tab2 = createSocket(cookie1);
  await new Promise<void>((resolve) => tab2.on("connect", () => resolve()));
  console.log("✔ Second tab connected for demo1");

  // Disconnect tab1 - demo1 should still be online because tab2 is connected
  let offlineTriggered = false;
  socket2.on("presence:update", (p: any) => {
    if (p.userId === user1.id && !p.isOnline) {
      offlineTriggered = true;
    }
  });

  socket1.disconnect();
  await new Promise((r) => setTimeout(r, 600));
  if (offlineTriggered) {
    throw new Error("demo1 went offline prematurely despite tab2 still connected!");
  }
  console.log("✔ demo1 stayed online after disconnecting 1 of 2 tabs (multi-tab presence works)");

  // Now disconnect tab2 - demo1 should go offline
  const offlinePromise = waitEvent(socket2, "presence:update");
  tab2.disconnect();
  const offlineEvent = await offlinePromise;
  if (offlineEvent.userId !== user1.id || offlineEvent.isOnline !== false) {
    throw new Error(`Expected offline presence event for demo1, got: ${JSON.stringify(offlineEvent)}`);
  }
  console.log("✔ demo1 transitioned to offline after closing all tabs");

  socket2.disconnect();

  console.log("\n=======================================================");
  console.log("🎉 ALL RUNTIME VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runVerification()
  .catch((e) => {
    console.error("❌ VERIFICATION ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
