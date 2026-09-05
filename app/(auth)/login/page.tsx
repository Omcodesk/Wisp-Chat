import { LoginForm } from "@/components/auth/login-form";
import { MessageSquareCode, Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-canvas px-4 py-8">
      {/* Background ambient light effects */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 chat-pattern opacity-60" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-accent to-indigo-500 text-white shadow-glow">
            <MessageSquareCode className="h-7 w-7" />
            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
              <Sparkles className="h-2.5 w-2.5" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Welcome to Wisp
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Fast, secure, and private realtime messaging.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-xl border border-border bg-surface/90 p-6 shadow-card backdrop-blur-xl sm:p-8">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-ink-faint">
          Wisp Realtime Messaging System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
