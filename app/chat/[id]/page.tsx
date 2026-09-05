import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { ConversationView } from "@/components/chat/conversation-view";

interface Props {
  params: { id: string };
}

export default async function ConversationPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  // Verify membership server-side before rendering the client component.
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: params.id, userId } },
    select: { id: true },
  });
  if (!membership) notFound();

  // Fetch the peer's info for the header (server-side only, no extra client fetch).
  const peer = await prisma.conversationMember.findFirst({
    where: { conversationId: params.id, userId: { not: userId } },
    include: { user: { select: { id: true, name: true, avatarUrl: true, lastSeenAt: true } } },
  });

  return (
    <ConversationView
      conversationId={params.id}
      peer={
        peer
          ? {
              id: peer.user.id,
              name: peer.user.name,
              avatarUrl: peer.user.avatarUrl,
              lastSeenAt: peer.user.lastSeenAt.toISOString(),
            }
          : null
      }
    />
  );
}
