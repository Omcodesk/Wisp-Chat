"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";

interface LoginFormProps {
  onSelectDemo?: (email: string) => void;
}

export function LoginForm({ onSelectDemo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);

    if (res?.error) {
      setError("Invalid email or password. Please verify your credentials.");
      return;
    }
    router.push("/chat");
    router.refresh();
  }

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("Password123!");
    setError(null);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Sign in">
        {/* Email Field */}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-raised pl-10 pr-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="you@example.com"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Password
            </label>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-raised pl-10 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger animate-fade-in">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="group relative flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-150 hover:bg-accent-hover hover:shadow-glow disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Signing in…</span>
            </>
          ) : (
            <>
              <span>Sign in to Wisp</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      {/* Demo Accounts Panel */}
      <div className="rounded-lg border border-border bg-surface/80 p-3.5 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-ink">Demo Accounts</span>
          <span className="text-[11px] text-ink-faint">Password: Password123!</span>
        </div>
        <p className="text-ink-muted text-[11px] mb-2.5">
          Click any account to pre-fill credentials instantly:
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["demo1@example.com", "demo2@example.com", "demo3@example.com"] as const).map((demo, idx) => (
            <button
              key={demo}
              type="button"
              onClick={() => fillDemo(demo)}
              className="flex flex-col items-center justify-center rounded-sm border border-border/80 bg-surface-raised/70 px-2 py-1.5 text-center transition hover:border-accent hover:bg-accent/10 hover:text-accent group"
            >
              <span className="font-medium text-ink group-hover:text-accent">User {idx + 1}</span>
              <span className="text-[10px] text-ink-faint truncate max-w-full">demo{idx + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
