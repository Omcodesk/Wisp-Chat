"use client";

import { X, Sparkles } from "lucide-react";
import { stickerPack } from "@/lib/stickers/pack";

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function StickerPicker({ onSelect, onClose }: Props) {
  return (
    <div className="flex flex-col bg-surface-raised/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-accent">
          <Sparkles className="h-4 w-4" />
          <span>Wisp Stickers</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-active hover:text-ink transition"
          aria-label="Close sticker picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto p-3 scrollbar-thin">
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
          {stickerPack.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => onSelect(sticker.url)}
              title={sticker.label}
              className="group flex flex-col items-center justify-center rounded-xl border border-transparent p-2 transition-all duration-150 hover:scale-110 hover:border-border/80 hover:bg-surface-active hover:shadow-sm active:scale-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sticker.url}
                alt={sticker.label}
                className="h-12 w-12 object-contain drop-shadow"
              />
              <span className="mt-1 text-[10px] text-ink-faint group-hover:text-ink transition-colors truncate max-w-full">
                {sticker.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
