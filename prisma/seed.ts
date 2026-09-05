import { PrismaClient, MessageType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// Demo credentials - documented in README. These are throwaway local-dev
// accounts only; never reuse this password scheme in production.
const DEMO_PASSWORD = "Password123!";

async function upsertUser(email: string, name: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      passwordHash,
      avatarUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}`,
    },
  });
}

async function main() {
  console.log("Seeding demo users...");
  const userA = await upsertUser("demo1@example.com", "Ava Thompson");
  const userB = await upsertUser("demo2@example.com", "Ben Carter");
  const userC = await upsertUser("demo3@example.com", "Chloe Nguyen");

  console.log("Seeding conversation A<->B...");
  let conversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId: userA.id } } },
        { members: { some: { userId: userB.id } } },
      ],
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        members: {
          create: [{ userId: userA.id }, { userId: userB.id }],
        },
      },
    });
  }

  // A second, empty-ish conversation with User C to exercise the
  // conversation list / unread-count UI with more than one thread.
  let conversationAC = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId: userA.id } } },
        { members: { some: { userId: userC.id } } },
      ],
    },
  });
  if (!conversationAC) {
    conversationAC = await prisma.conversation.create({
      data: { members: { create: [{ userId: userA.id }, { userId: userC.id }] } },
    });
  }

  const existingCount = await prisma.message.count({
    where: { conversationId: conversation.id },
  });

  if (existingCount < 500) {
    console.log("Seeding ~600 messages for pagination demo (this takes a moment)...");
    const sampleLines = [
      "Hey, how's it going?",
      "Did you catch the game last night?",
      "Working on the new proposal, want to review it later?",
      "Haha that's hilarious",
      "Sure, let's sync at 3pm",
      "Sending over the files now",
      "Can you call me when you're free?",
      "That sounds like a great plan",
      "Running a bit late, be there in 10",
      "Thanks so much for the help earlier",
      "Let me check and get back to you",
      "Perfect, see you then",
      "No worries at all",
      "I'll take a look tonight",
      "Appreciate it!",
    ];

    const BATCH = 200;
    const total = 600;
    const baseTime = Date.now() - total * 5 * 60 * 1000; // spread over days

    for (let start = 0; start < total; start += BATCH) {
      const batchData = [];
      for (let i = start; i < Math.min(start + BATCH, total); i++) {
        const sender = i % 2 === 0 ? userA : userB;
        batchData.push({
          clientMessageId: randomUUID(),
          conversationId: conversation.id,
          senderId: sender.id,
          type: MessageType.TEXT,
          content: sampleLines[i % sampleLines.length],
          createdAt: new Date(baseTime + i * 5 * 60 * 1000),
          deliveredAt: new Date(baseTime + i * 5 * 60 * 1000 + 1000),
          readAt: i < total - 5 ? new Date(baseTime + i * 5 * 60 * 1000 + 2000) : null,
        });
      }
      await prisma.message.createMany({ data: batchData });
    }
  }

  // Mark each member's read cursor near "now" for A, slightly behind for B,
  // so the seeded data demonstrates an unread badge out of the box.
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
  });

  await prisma.conversationMember.updateMany({
    where: { conversationId: conversation.id, userId: userA.id },
    data: { lastReadAt: lastMessage?.createdAt },
  });
  await prisma.conversationMember.updateMany({
    where: { conversationId: conversation.id, userId: userB.id },
    data: { lastReadAt: new Date((lastMessage?.createdAt.getTime() ?? Date.now()) - 30 * 60 * 1000) },
  });

  console.log("Seed complete.");
  console.log("Demo accounts (password for all: %s):", DEMO_PASSWORD);
  console.log("  demo1@example.com (Ava)");
  console.log("  demo2@example.com (Ben)");
  console.log("  demo3@example.com (Chloe)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
