"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Loader2, ChevronUp, ArrowDown, Sparkles } from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ClientMessage } from "@/hooks/use-conversation";

interface Peer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  messages: ClientMessage[];
  currentUserId: string;
  hasMore: boolean;
  loadingInitial: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onDelete?: (messageId: string) => void;
  peer: Peer | null;
}

export function MessageList({
  messages,
  currentUserId,
  hasMore,
  loadingInitial,
  loadingOlder,
  loadOlder,
  onRetry,
  onDelete,
  peer,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const prevScrollHeight = useRef(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Scroll to bottom on initial load and incoming/outgoing messages
  useEffect(() => {
    if (loadingInitial) return;
    const lastMsg = messages[messages.length - 1];
    const isOwnLast = lastMsg?.senderId === currentUserId;
    if (isNearBottom.current || isOwnLast) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      isNearBottom.current = true;
      setShowScrollBottom(false);
    }
  }, [messages, loadingInitial, currentUserId]);

  // Preserve scroll position when older messages are loaded
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (loadingOlder) {
      prevScrollHeight.current = el.scrollHeight;
    } else {
      const delta = el.scrollHeight - prevScrollHeight.current;
      if (delta > 0) el.scrollTop += delta;
    }
  }, [loadingOlder]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 100;
    isNearBottom.current = near;
    setShowScrollBottom(!near);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 chat-pattern">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
        <p className="text-xs text-ink-muted">Decrypting conversation…</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden chat-pattern">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col overflow-y-auto px-4 py-4 scrollbar-thin"
      >
        {/* Load older button */}
        {hasMore && (
          <div className="flex justify-center pb-4 pt-1">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-raised/90 px-4 py-1.5 text-xs font-medium text-ink-muted shadow-sm backdrop-blur-md transition hover:border-accent/40 hover:bg-surface-active hover:text-ink disabled:opacity-50"
            >
              {loadingOlder ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              <span>{loadingOlder ? "Loading older messages…" : "Load older messages"}</span>
            </button>
          </div>
        )}

        {/* Empty state for fresh conversation */}
        {messages.length === 0 && !loadingInitial && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-raised border border-border/80 text-accent shadow-card">
              <Sparkles className="h-7 w-7 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">
                Start a conversation with {peer?.name ?? "your contact"}
              </p>
              <p className="mt-1 text-xs text-ink-muted max-w-xs">
                Messages and media sent here are delivered instantly in real time.
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex flex-col gap-1 mt-auto">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const isOwn = msg.senderId === currentUserId;
            const showAvatar = !isOwn && (!prev || prev.senderId !== msg.senderId);
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={isOwn}
                showAvatar={showAvatar}
                peer={peer}
                onRetry={onRetry}
                onDelete={onDelete}
              />

            );
          })}
        </div>

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-ink shadow-card backdrop-blur-md transition hover:bg-surface-active hover:text-accent hover:border-accent/40 animate-fade-in z-10"
          aria-label="Scroll to newest messages"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
