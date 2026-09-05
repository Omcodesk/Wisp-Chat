"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, Image as ImageIcon, Smile, Sparkles, Film } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { GifPicker } from "@/components/chat/gif-picker";
import { StickerPicker } from "@/components/chat/sticker-picker";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { ImageUploader } from "@/components/chat/image-uploader";
import type { MessageDTO } from "@/types";

type SendPayload =
  | { conversationId: string; type: "TEXT"; content: string }
  | { conversationId: string; type: "GIF" | "STICKER"; mediaUrl: string; mediaWidth?: number; mediaHeight?: number };

interface Props {
  conversationId: string;
  onSend: (payload: SendPayload) => void;
  onImageUploaded?: (message: MessageDTO) => void;
  onTyping: () => void;
}

type Panel = "emoji" | "gif" | "sticker" | "image" | null;

export function Composer({ conversationId, onSend, onImageUploaded, onTyping }: Props) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const togglePanel = useCallback((p: Panel) => {
    setPanel((prev) => (prev === p ? null : p));
  }, []);

  const submitText = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ conversationId, type: "TEXT", content: trimmed });
    setText("");
    if (textRef.current) {
      textRef.current.style.height = "auto";
      textRef.current.focus();
    }
  }, [text, conversationId, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitText();
      }
    },
    [submitText]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      onTyping();
      const target = e.target;
      target.style.height = "auto";
      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
    },
    [onTyping]
  );

  // Insert emoji at cursor position WITHOUT auto-sending
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const textarea = textRef.current;
      if (!textarea) {
        setText((prev) => prev + emoji);
        return;
      }
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? text.length;
      const nextText = text.substring(0, start) + emoji + text.substring(end);
      setText(nextText);
      onTyping();

      // Maintain focus and set cursor right after inserted emoji
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          const newPos = start + emoji.length;
          textarea.setSelectionRange(newPos, newPos);
        }
      }, 0);
    },
    [text, onTyping]
  );

  const handleGifSelect = useCallback(
    (gif: { sendUrl: string; width: number; height: number }) => {
      onSend({
        conversationId,
        type: "GIF",
        mediaUrl: gif.sendUrl,
        mediaWidth: gif.width,
        mediaHeight: gif.height,
      });
      setPanel(null);
    },
    [conversationId, onSend]
  );

  const handleStickerSelect = useCallback(
    (url: string) => {
      onSend({
        conversationId,
        type: "STICKER",
        mediaUrl: url,
      });
      setPanel(null);
    },
    [conversationId, onSend]
  );

  return (
    <div className="relative flex-shrink-0 border-t border-border bg-surface/95 backdrop-blur-lg">
      {/* Sliding Popover Panel Drawer */}
      {panel && (
        <div className="border-b border-border bg-surface shadow-popover animate-slide-up">
          {panel === "emoji" && (
            <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setPanel(null)} />
          )}
          {panel === "gif" && (
            <GifPicker onSelect={handleGifSelect} onClose={() => setPanel(null)} />
          )}
          {panel === "sticker" && (
            <StickerPicker onSelect={handleStickerSelect} onClose={() => setPanel(null)} />
          )}
          {panel === "image" && (
            <ImageUploader
              conversationId={conversationId}
              onUploaded={(msg) => {
                onImageUploaded?.(msg);
                setPanel(null);
              }}
              onClose={() => setPanel(null)}
            />
          )}
        </div>
      )}

      {/* Main Composer Row */}
      <div className="flex items-end gap-2 px-3 sm:px-4 py-3">
        {/* Media Buttons Group */}
        <div className="flex items-center gap-1 pb-0.5">
          <ToolButton
            icon={<ImageIcon className="h-4 w-4" />}
            label="Upload photo"
            active={panel === "image"}
            onClick={() => togglePanel("image")}
          />
          <ToolButton
            icon={<Smile className="h-4 w-4" />}
            label="Emoji picker"
            active={panel === "emoji"}
            onClick={() => togglePanel("emoji")}
          />
          <ToolButton
            icon={<Film className="h-4 w-4" />}
            label="Search GIFs"
            active={panel === "gif"}
            onClick={() => togglePanel("gif")}
          />
          <ToolButton
            icon={<Sparkles className="h-4 w-4" />}
            label="Send sticker"
            active={panel === "sticker"}
            onClick={() => togglePanel("sticker")}
          />
        </div>

        {/* Rounded Pill Text Input */}
        <div className="relative flex flex-1 items-center rounded-2xl border border-border bg-surface-raised/80 px-3.5 py-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <textarea
            ref={textRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
            className="w-full resize-none bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none scrollbar-thin"
            style={{ maxHeight: "120px", minHeight: "22px" }}
          />
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={submitText}
          disabled={!text.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-glow-sm transition-all duration-150 hover:bg-accent-hover hover:scale-105 active:scale-95 disabled:opacity-35 disabled:hover:scale-100 disabled:pointer-events-none"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150",
        active
          ? "bg-accent/20 text-accent ring-1 ring-accent/30"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink"
      )}
    >
      {icon}
    </button>
  );
}
