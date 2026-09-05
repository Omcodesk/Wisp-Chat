"use client";

import { format } from "date-fns";
import { Check, CheckCheck, Clock, AlertCircle, RotateCcw, Trash2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { ClientMessage } from "@/hooks/use-conversation";

interface Peer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  message: ClientMessage;
  isOwn: boolean;
  showAvatar: boolean;
  peer: Peer | null;
  onRetry: (clientMessageId: string) => void;
  onDelete?: (messageId: string) => void;
}


function StatusIcon({ message, isSticker }: { message: ClientMessage; isSticker?: boolean }) {
  const iconColor = isSticker ? "text-ink-muted" : "text-white/60";
  if (message.status === "pending") {
    return (
      <span title="Sending…" className="inline-flex items-center">
        <Clock className={cn("h-3 w-3 animate-spin [animation-duration:3s]", isSticker ? "text-ink-faint" : "text-white/60")} />
      </span>
    );
  }
  if (message.status === "failed") {
    return (
      <span title="Failed to send" className="inline-flex items-center">
        <AlertCircle className="h-3 w-3 text-danger" />
      </span>
    );
  }
  if (message.readAt) {
    return (
      <span title="Read" className="inline-flex items-center">
        <CheckCheck className={cn("h-3.5 w-3.5", isSticker ? "text-accent" : "text-sky-300")} />
      </span>
    );
  }
  if (message.deliveredAt) {
    return (
      <span title="Delivered" className="inline-flex items-center">
        <CheckCheck className={cn("h-3.5 w-3.5", isSticker ? "text-ink-muted" : "text-white/70")} />
      </span>
    );
  }
  return (
    <span title="Sent" className="inline-flex items-center">
      <Check className={cn("h-3 w-3", iconColor)} />
    </span>
  );
}

function SmallAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-border/80 bg-surface-active">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-accent">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function MessageBubble({ message, isOwn, showAvatar, peer, onRetry, onDelete }: Props) {
  const time = format(new Date(message.createdAt), "HH:mm");

  const bubbleContent = () => {
    if (message.type === "TEXT") {
      return (
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed select-text">
          {message.content}
        </p>
      );
    }

    if (message.type === "IMAGE" && message.mediaUrl) {
      return (
        <div className="overflow-hidden rounded-xl border border-white/10 shadow-md">
          <Image
            src={message.mediaUrl}
            alt="Shared image"
            width={message.mediaWidth ?? 320}
            height={message.mediaHeight ?? 240}
            className="max-w-[280px] sm:max-w-[340px] max-h-[360px] object-cover transition-transform duration-200 hover:scale-[1.01]"
            unoptimized
          />
        </div>
      );
    }

    if ((message.type === "GIF" || message.type === "STICKER") && message.mediaUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.mediaUrl}
          alt={message.type === "GIF" ? "GIF" : "Sticker"}
          className={cn(
            "rounded-xl object-contain transition-transform duration-200 hover:scale-[1.02]",
            message.type === "STICKER"
              ? "max-h-28 max-w-28 drop-shadow-md"
              : "max-h-56 max-w-[280px] sm:max-w-[320px] rounded-xl border border-white/10 shadow-md"
          )}
        />
      );
    }

    return null;
  };

  const isMedia = message.type !== "TEXT";
  const isSticker = message.type === "STICKER";

  // Telegram / WhatsApp style asymmetric bubble styling
  const bubbleClasses = isSticker
    ? "bg-transparent p-0 shadow-none border-0"
    : isMedia
    ? "p-1 bg-surface-raised/80 border border-border/80 shadow-bubble"
    : isOwn
    ? "bg-gradient-to-tr from-accent to-indigo-500 text-white rounded-2xl rounded-br-xs shadow-glow-sm px-3.5 py-2.5"
    : "bg-surface-raised border border-border/70 text-ink rounded-2xl rounded-bl-xs shadow-bubble px-3.5 py-2.5";

  return (
    <div
      className={cn(
        "group flex items-end gap-2 animate-fade-in",
        isOwn ? "flex-row-reverse" : "flex-row",
        showAvatar ? "mt-3" : "mt-0.5"
      )}
    >
      {/* Avatar (incoming only, shown on top/bottom of consecutive run) */}
      {!isOwn && (
        <div className="w-7 flex-shrink-0">
          {showAvatar && peer && <SmallAvatar name={peer.name} url={peer.avatarUrl} />}
        </div>
      )}

      <div className={cn("flex max-w-[82%] sm:max-w-[70%] flex-col", isOwn ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative transition-all duration-150",
            bubbleClasses,
            message.status === "pending" && "opacity-75",
            message.status === "failed" && "ring-1 ring-danger bg-danger/10 text-danger"
          )}
        >
          {bubbleContent()}

          {/* Timestamp and status checkmarks */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1 select-none",
              isOwn ? "justify-end" : "justify-start",
              isSticker && "px-1"
            )}
          >
            <span
              className={cn(
                "text-[10px] font-medium tracking-tight",
                isOwn && !isSticker ? "text-white/70" : "text-ink-faint"
              )}
            >
              {time}
            </span>
            {isOwn && <StatusIcon message={message} isSticker={isSticker} />}
          </div>
        </div>

        {/* Retry button for failed messages */}
        {message.status === "failed" && (
          <button
            onClick={() => onRetry(message.clientMessageId)}
            className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-danger hover:underline animate-fade-in"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry sending</span>
          </button>
        )}
      </div>

      {/* Delete button (visible on hover for sent messages) */}
      {isOwn && onDelete && message.status !== "pending" && (
        <button
          onClick={() => onDelete(message.id)}
          title="Delete message"
          aria-label="Delete message"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-surface-active self-center"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

