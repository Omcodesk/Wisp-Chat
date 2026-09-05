import { prisma } from "@/lib/db/prisma";

export class ForbiddenError extends Error {
  constructor(message = "You are not a member of this conversation") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The single choke point every code path (HTTP routes AND socket handlers)
 * must go through before touching a conversation's messages/metadata. See
 * README "Authorization" - this is what prevents user A from reading or
 * writing into user B's conversation by guessing/forging a conversationId.
 */
export async function assertConversationMember(userId: string, conversationId: string): Promise<void> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenError();
  }
}

export async function isConversationMember(userId: string, conversationId: string): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function getOtherMemberId(conversationId: string, userId: string): Promise<string | null> {
  const other = await prisma.conversationMember.findFirst({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });
  return other?.userId ?? null;
}
