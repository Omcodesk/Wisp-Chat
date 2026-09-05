import { MessageSquareCode, ShieldCheck, Zap, Lock } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div className="relative hidden md:flex h-full flex-1 flex-col items-center justify-center overflow-hidden chat-pattern px-6 text-center">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative z-10 flex max-w-sm flex-col items-center animate-fade-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-raised border border-border/70 text-accent shadow-card">
          <MessageSquareCode className="h-10 w-10 text-accent" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Select a conversation
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Choose an existing contact from the sidebar or start a new chat to begin messaging with end-to-end delivery tracking.
        </p>

        {/* Feature Highlights */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full border-t border-border/60 pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-accent">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-ink">Realtime</span>
            <span className="text-[10px] text-ink-faint">Instant sync</span>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-online">
              <Lock className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-ink">Private</span>
            <span className="text-[10px] text-ink-faint">Secure & clean</span>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-indigo-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-ink">Moderated</span>
            <span className="text-[10px] text-ink-faint">Safe media</span>
          </div>
        </div>
      </div>
    </div>
  );
}
