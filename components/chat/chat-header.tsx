"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, MoreVertical, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Peer {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeenAt: string;
}

interface Props {
  peer: Peer | null;
  isOnline: boolean;
  lastSeenAt: string;
  typingUserIds: Set<string>;
}

export function ChatHeader({ peer, isOnline, lastSeenAt, typingUserIds }: Props) {
  const isTyping = peer ? typingUserIds.has(peer.id) : false;

  const subtitle = isTyping ? (
    <span className="flex items-center gap-1 text-accent font-medium">
      typing
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1 w-1 rounded-full bg-accent animate-bounce" />
      </span>
    </span>
  ) : isOnline ? (
    <span className="text-online font-medium flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-online animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
      Online
    </span>
  ) : (
    <span className="text-ink-faint">
      Last seen {formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}
    </span>
  );

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md z-10">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Back Button */}
        <Link
          href="/chat"
          className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-raised hover:text-ink transition"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {peer ? (
          <>
            {/* Avatar with live presence ring */}
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-border/80 bg-surface-active">
              {peer.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={peer.avatarUrl} alt={peer.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-accent/30 to-indigo-500/20 text-sm font-bold text-accent">
                  {peer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface transition-colors",
                  isOnline ? "bg-online shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-ink-faint/40"
                )}
              />
            </div>

            {/* Peer info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-ink">{peer.name}</p>
                <span title="Verified contact" className="inline-flex items-center">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent/80 flex-shrink-0" />
                </span>
              </div>
              <div className="truncate text-xs">{subtitle}</div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-surface-raised" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 animate-pulse rounded bg-surface-raised" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-surface-raised" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 text-ink-muted">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-raised hover:text-ink transition"
          aria-label="Conversation options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
