"use client";

import { useState, useMemo } from "react";
import { Search, X, Smile } from "lucide-react";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiGroup {
  category: string;
  emojis: Array<{ char: string; name: string }>;
}

const EMOJI_GROUPS: EmojiGroup[] = [
  {
    category: "Smileys & Emotion",
    emojis: [
      { char: "😀", name: "grinning face" },
      { char: "😃", name: "grinning face with big eyes" },
      { char: "😄", name: "grinning face with smiling eyes" },
      { char: "😁", name: "beaming face with smiling eyes" },
      { char: "😆", name: "grinning squinting face" },
      { char: "😅", name: "grinning face with sweat" },
      { char: "😂", name: "face with tears of joy" },
      { char: "🤣", name: "rolling on the floor laughing" },
      { char: "😊", name: "smiling face with smiling eyes" },
      { char: "😇", name: "smiling face with halo" },
      { char: "🙂", name: "slightly smiling face" },
      { char: "😉", name: "winking face" },
      { char: "😌", name: "relieved face" },
      { char: "😍", name: "smiling face with heart-eyes" },
      { char: "🥰", name: "smiling face with hearts" },
      { char: "😘", name: "face blowing a kiss" },
      { char: "😋", name: "face savoring food" },
      { char: "😛", name: "face with tongue" },
      { char: "😜", name: "winking face with tongue" },
      { char: "🤪", name: "zany face" },
      { char: "🤨", name: "face with raised eyebrow" },
      { char: "🧐", name: "face with monocle" },
      { char: "🤓", name: "nerd face" },
      { char: "😎", name: "smiling face with sunglasses" },
      { char: "🤩", name: "star-struck" },
      { char: "🥳", name: "partying face" },
      { char: "😏", name: "smirking face" },
      { char: "😒", name: "unamused face" },
      { char: "😞", name: "disappointed face" },
      { char: "😔", name: "pensive face" },
      { char: "😟", name: "worried face" },
      { char: "😕", name: "confused face" },
      { char: "🙁", name: "slightly frowning face" },
      { char: "🥺", name: "pleading face" },
      { char: "😢", name: "crying face" },
      { char: "😭", name: "loudly crying face" },
      { char: "😤", name: "face with steam from nose" },
      { char: "😠", name: "angry face" },
      { char: "😡", name: "pouting face" },
      { char: "🤬", name: "face with symbols on mouth" },
      { char: "🤯", name: "exploding head" },
      { char: "😳", name: "flushed face" },
      { char: "🥵", name: "hot face" },
      { char: "🥶", name: "cold face" },
      { char: "😱", name: "face screaming in fear" },
      { char: "😨", name: "fearful face" },
      { char: "😰", name: "anxious face with sweat" },
      { char: "😥", name: "sad but relieved face" },
      { char: "😓", name: "downcast face with sweat" },
      { char: "🤗", name: "smiling face with open hands" },
      { char: "🤔", name: "thinking face" },
      { char: "🤭", name: "face with hand over mouth" },
      { char: "🤫", name: "shushing face" },
      { char: "🤥", name: "lying face" },
      { char: "😶", name: "face without mouth" },
      { char: "😐", name: "neutral face" },
      { char: "😑", name: "expressionless face" },
      { char: "😬", name: "grimacing face" },
      { char: "🙄", name: "face with rolling eyes" },
      { char: "😴", name: "sleeping face" },
      { char: "🤤", name: "drooling face" },
      { char: "😷", name: "face with medical mask" },
    ],
  },
  {
    category: "Gestures & Body",
    emojis: [
      { char: "👋", name: "waving hand" },
      { char: "🤚", name: "raised back of hand" },
      { char: "🖐", name: "hand with fingers splayed" },
      { char: "✋", name: "raised hand" },
      { char: "🖖", name: "vulcan salute" },
      { char: "👌", name: "ok hand" },
      { char: "🤌", name: "pinched fingers" },
      { char: "🤏", name: "pinching hand" },
      { char: "✌", name: "victory hand" },
      { char: "🤞", name: "crossed fingers" },
      { char: "🤟", name: "love-you gesture" },
      { char: "🤘", name: "sign of the horns" },
      { char: "🤙", name: "call me hand" },
      { char: "👈", name: "backhand index pointing left" },
      { char: "👉", name: "backhand index pointing right" },
      { char: "👆", name: "backhand index pointing up" },
      { char: "👇", name: "backhand index pointing down" },
      { char: "👍", name: "thumbs up" },
      { char: "👎", name: "thumbs down" },
      { char: "✊", name: "raised fist" },
      { char: "👊", name: "oncoming fist" },
      { char: "👏", name: "clapping hands" },
      { char: "🙌", name: "raising hands" },
      { char: "👐", name: "open hands" },
      { char: "🤲", name: "palms up together" },
      { char: "🤝", name: "handshake" },
      { char: "🙏", name: "folded hands pray" },
      { char: "💪", name: "flexed biceps" },
      { char: "👀", name: "eyes" },
      { char: "🧠", name: "brain" },
    ],
  },
  {
    category: "Hearts & Sparkles",
    emojis: [
      { char: "❤️", name: "red heart" },
      { char: "🧡", name: "orange heart" },
      { char: "💛", name: "yellow heart" },
      { char: "💚", name: "green heart" },
      { char: "💙", name: "blue heart" },
      { char: "💜", name: "purple heart" },
      { char: "🖤", name: "black heart" },
      { char: "🤍", name: "white heart" },
      { char: "🤎", name: "brown heart" },
      { char: "💔", name: "broken heart" },
      { char: "❣️", name: "heart exclamation" },
      { char: "💕", name: "two hearts" },
      { char: "💞", name: "revolving hearts" },
      { char: "💓", name: "beating heart" },
      { char: "💗", name: "growing heart" },
      { char: "💖", name: "sparkling heart" },
      { char: "💘", name: "heart with arrow" },
      { char: "💝", name: "heart with ribbon" },
      { char: "🔥", name: "fire flame" },
      { char: "✨", name: "sparkles" },
      { char: "🌟", name: "glowing star" },
      { char: "💥", name: "collision" },
      { char: "🎉", name: "party popper" },
      { char: "🎊", name: "confetti ball" },
      { char: "💯", name: "hundred points" },
      { char: "🚀", name: "rocket" },
      { char: "⚡", name: "high voltage" },
      { char: "🎯", name: "bullseye" },
      { char: "🏆", name: "trophy" },
    ],
  },
];

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return EMOJI_GROUPS;

    return EMOJI_GROUPS.map((group) => ({
      category: group.category,
      emojis: group.emojis.filter((e) => e.name.toLowerCase().includes(q) || e.char.includes(q)),
    })).filter((group) => group.emojis.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col bg-surface-raised/95 backdrop-blur-md">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-accent">
          <Smile className="h-4 w-4" />
          <span>Emoji</span>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search emoji…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-border bg-canvas pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-active hover:text-ink transition"
          aria-label="Close emoji picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Emojis Grid Container */}
      <div className="max-h-56 overflow-y-auto px-4 py-3 scrollbar-thin">
        {filteredGroups.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted">
            No emojis match &ldquo;{query}&rdquo;
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.category} className="mb-3">
              <div className="mb-1.5 text-[11px] font-semibold text-ink-faint">
                {group.category}
              </div>
              <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji.name + emoji.char}
                    type="button"
                    onClick={() => onSelect(emoji.char)}
                    title={emoji.name}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:scale-125 hover:bg-surface-active active:scale-95 select-none"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
