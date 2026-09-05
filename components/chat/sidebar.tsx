"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Search,
  Plus,
  LogOut,
  MessageSquare,
  X,
  Loader2,
  ImageIcon,
  Smile,
  Sparkles,
  UserPlus,
  MessageSquareCode,
} from "lucide-react";
import { useConversations } from "@/hooks/use-conversations";
import { useCurrentUser } from "@/components/providers/current-user-context";
import { cn } from "@/lib/utils/cn";
import type { ConversationSummaryDTO } from "@/types";

interface UserResult {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-7 w-7 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-11 w-11 text-base",
  };

  return (
    <div
      className={cn(
        "relative flex-shrink-0 overflow-hidden rounded-full ring-1 ring-border/60 bg-surface-active",
        sizeClasses[size]
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-accent/30 to-indigo-500/20 font-semibold text-accent">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function PresenceDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface transition-colors",
        isOnline ? "bg-online shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-ink-faint/50"
      )}
    />
  );
}

function ConversationItem({
  conv,
  active,
}: {
  conv: ConversationSummaryDTO;
  active: boolean;
}) {
  const lastMsg = conv.lastMessage;
  const renderPreview = () => {
    if (!lastMsg) return <span className="italic text-ink-faint">No messages yet</span>;
    if (lastMsg.type === "IMAGE") {
      return (
        <span className="flex items-center gap-1 text-ink-muted">
          <ImageIcon className="h-3 w-3 text-accent" /> Photo
        </span>
      );
    }
    if (lastMsg.type === "GIF") {
      return (
        <span className="flex items-center gap-1 text-ink-muted">
          <Smile className="h-3 w-3 text-accent" /> GIF
        </span>
      );
    }
    if (lastMsg.type === "STICKER") {
      return (
        <span className="flex items-center gap-1 text-ink-muted">
          <Sparkles className="h-3 w-3 text-accent" /> Sticker
        </span>
      );
    }
    return <span className="truncate">{lastMsg.content ?? ""}</span>;
  };

  return (
    <Link
      href={`/chat/${conv.id}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150",
        active
          ? "bg-surface-raised border border-accent/30 shadow-sm"
          : "hover:bg-surface-raised/70 border border-transparent"
      )}
    >
      {/* Active Left Indicator Bar */}
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-accent" />
      )}

      <div className="relative flex-shrink-0">
        <Avatar name={conv.peer.name} url={conv.peer.avatarUrl} size="md" />
        <PresenceDot isOnline={conv.peer.isOnline} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-semibold transition-colors",
              active ? "text-ink font-bold" : "text-ink group-hover:text-white"
            )}
          >
            {conv.peer.name}
          </span>
          {lastMsg && (
            <span className="flex-shrink-0 text-[11px] text-ink-faint">
              {formatDistanceToNowStrict(new Date(lastMsg.createdAt), { addSuffix: false })}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-1.5">
          <div className="min-w-0 flex-1 text-xs text-ink-muted line-clamp-1">
            {renderPreview()}
          </div>
          {conv.unreadCount > 0 && (
            <span className="flex-shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink shadow-glow-sm animate-pop-in">
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const activeId = pathname.startsWith("/chat/") ? (pathname.split("/")[2] ?? null) : null;
  const { conversations, loading } = useConversations(activeId);

  const [filterText, setFilterText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter existing conversations in sidebar
  const filteredConversations = useMemo(() => {
    if (!filterText.trim()) return conversations;
    const q = filterText.toLowerCase();
    return conversations.filter(
      (c) =>
        c.peer.name.toLowerCase().includes(q) ||
        (c.lastMessage?.content && c.lastMessage.content.toLowerCase().includes(q))
    );
  }, [conversations, filterText]);

  const handleSearchUsers = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, []);

  const handleStartConversation = useCallback(
    async (peerId: string) => {
      setCreating(true);
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerUserId: peerId }),
        });
        const data = await res.json();
        if (data.conversationId) {
          setShowNew(false);
          setQuery("");
          setSearchResults([]);
          router.push(`/chat/${data.conversationId}`);
        }
      } finally {
        setCreating(false);
      }
    },
    [router]
  );

  return (
    <aside
      className={cn(
        "flex h-full w-full md:w-80 lg:w-96 flex-shrink-0 flex-col border-r border-border bg-surface select-none",
        // Responsive visibility: on mobile, hide sidebar if active conversation is open
        activeId ? "hidden md:flex" : "flex"
      )}
    >
      {/* Top App Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4 py-3 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-accent to-indigo-500 text-white shadow-glow-sm">
            <MessageSquareCode className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-ink">Wisp</h1>
            <p className="text-[10px] text-ink-muted">Encrypted Messaging</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowNew(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink-muted transition hover:border-accent/40 hover:bg-accent/15 hover:text-accent"
            title="Start new conversation"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink-muted transition hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter / Search Bar for existing chats */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search chats…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full rounded-lg border border-border/70 bg-canvas pl-9 pr-8 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/25"
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* New conversation modal/drawer */}
      {showNew && (
        <div className="border-b border-border bg-surface-raised/95 px-3 py-3 animate-slide-up">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <UserPlus className="h-3.5 w-3.5" />
              <span>New Conversation</span>
            </div>
            <button
              onClick={() => {
                setShowNew(false);
                setQuery("");
                setSearchResults([]);
              }}
              className="rounded p-1 text-ink-muted hover:bg-surface-active hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => handleSearchUsers(e.target.value)}
              className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
              autoFocus
            />
          </div>
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
            {searching && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
              </div>
            )}
            {!searching && query && searchResults.length === 0 && (
              <p className="py-3 text-center text-xs text-ink-muted">No users found.</p>
            )}
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => handleStartConversation(u.id)}
                disabled={creating}
                className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-surface disabled:opacity-60"
              >
                <Avatar name={u.name} url={u.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">{u.name}</p>
                  <p className="truncate text-[11px] text-ink-muted">{u.email}</p>
                </div>
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <span className="text-[10px] text-accent font-medium">Chat</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin space-y-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-xs">Loading chats…</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised text-ink-muted">
              <MessageSquare className="h-6 w-6 text-ink-faint" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink">
                {filterText ? "No matching conversations" : "No conversations yet"}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {filterText
                  ? "Try searching for a different name or message."
                  : "Click the + button above to start your first chat."}
              </p>
            </div>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} active={conv.id === activeId} />
          ))
        )}
      </div>

      {/* Current user profile footer */}
      <div className="flex items-center gap-3 border-t border-border bg-surface-raised/40 px-3 py-3">
        <Avatar name={currentUser.name} url={currentUser.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-ink">{currentUser.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{currentUser.email}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex h-2 w-2 rounded-full bg-online shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
        </div>
      </div>
    </aside>
  );
}
