"use client";

import { WifiOff, Loader2 } from "lucide-react";

interface Props {
  status: "connecting" | "connected" | "reconnecting";
}

export function ConnectionBanner({ status }: Props) {
  if (status === "connected") return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 animate-slide-up">
      {status === "connecting" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          <span>Connecting to Wisp realtime gateway…</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-amber-400" />
          <span>Connection interrupted. Reconnecting automatically…</span>
        </>
      )}
    </div>
  );
}
