"use client";

import { useState, useCallback, useRef } from "react";
import { X, AlertCircle, CheckCircle2, Loader2, UploadCloud, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { v4 as uuid } from "uuid";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

import type { MessageDTO } from "@/types";

interface Props {
  conversationId: string;
  onUploaded?: (message: MessageDTO) => void;
  onClose: () => void;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number; fileName: string; previewUrl: string | null }
  | { phase: "moderating"; fileName: string; previewUrl: string | null }
  | { phase: "done"; fileName: string }
  | { phase: "error"; message: string };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export function ImageUploader({ conversationId, onUploaded, onClose }: Props) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFile = useCallback(
    async (file: File) => {
      // Client-side validation first
      if (!ALLOWED_TYPES.includes(file.type as typeof ALLOWED_TYPES[number])) {
        setState({ phase: "error", message: "Only JPEG, PNG, and WebP images are allowed." });
        return;
      }
      if (file.size > MAX_BYTES) {
        setState({ phase: "error", message: "Image must be 10 MB or smaller." });
        return;
      }

      // Generate local preview
      const previewUrl = URL.createObjectURL(file);

      // Generate a stable clientMessageId for idempotency
      const clientMessageId = uuid();

      setState({ phase: "uploading", progress: 0, fileName: file.name, previewUrl });

      try {
        // Step 1: get presigned URL
        const urlRes = await fetch("/api/media/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!urlRes.ok) {
          const data = await urlRes.json().catch(() => ({}));
          setState({
            phase: "error",
            message: data?.error?.message ?? "Couldn't start upload. Please try again.",
          });
          return;
        }

        const { uploadUrl, storageKey } = await urlRes.json();

        // Step 2: PUT to R2 (with progress tracking)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setState({
                phase: "uploading",
                progress: Math.round((e.loaded / e.total) * 90),
                fileName: file.name,
                previewUrl,
              });
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed with status ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Network connection error during upload"));
          xhr.send(file);
        });

        setState({ phase: "moderating", fileName: file.name, previewUrl });

        // Step 3: complete (moderation + persist)
        const completeRes = await fetch("/api/media/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            clientMessageId,
            storageKey,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => ({}));
          const code = data?.error?.code ?? "";
          const message =
            code === "MODERATION_REJECTED"
              ? "Image was rejected by automated content moderation (inappropriate content detected)."
              : data?.error?.message ?? "Image processing failed. Please try again.";
          setState({ phase: "error", message });
          return;
        }

        const completeData = await completeRes.json();
        if (completeData?.message) {
          onUploaded?.(completeData.message);
        }

        setState({ phase: "done", fileName: file.name });
        router.refresh();
        setTimeout(onClose, 1000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to upload image.";
        setState({ phase: "error", message: msg });
      }
    },
    [conversationId, onUploaded, onClose, router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const isLoading = state.phase === "uploading" || state.phase === "moderating";

  return (
    <div className="flex flex-col bg-surface-raised/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-accent">
          <UploadCloud className="h-4 w-4" />
          <span>Upload Image</span>
        </div>
        <button
          onClick={onClose}
          disabled={isLoading}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-active hover:text-ink transition disabled:opacity-40"
          aria-label="Close image uploader"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-4">
        {state.phase === "idle" ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-150",
              isDragOver
                ? "border-accent bg-accent/10 scale-[1.01]"
                : "border-border hover:border-accent/60 hover:bg-surface-active"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-accent shadow-sm">
              <UploadCloud className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-xs font-bold text-ink">
                Click or drag & drop image to upload
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                JPEG, PNG, WebP · Up to 10 MB
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : state.phase === "uploading" ? (
          <div className="flex items-center gap-4 py-2">
            {state.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.previewUrl}
                alt="Upload preview"
                className="h-16 w-16 rounded-xl object-cover border border-border flex-shrink-0"
              />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink truncate max-w-[200px]">{state.fileName}</span>
                <span className="text-accent font-semibold">{state.progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-active">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <p className="text-[11px] text-ink-faint">Encrypting & uploading to secure storage…</p>
            </div>
          </div>
        ) : state.phase === "moderating" ? (
          <div className="flex items-center gap-4 py-3">
            {state.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.previewUrl}
                alt="Upload preview"
                className="h-16 w-16 rounded-xl object-cover border border-border flex-shrink-0"
              />
            )}
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>Checking image safety…</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Verifying content safety with automated AI moderation before delivery.
              </p>
            </div>
          </div>
        ) : state.phase === "done" ? (
          <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-online/15 text-online">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold text-online">Image approved and sent!</p>
          </div>
        ) : state.phase === "error" ? (
          <div className="space-y-3 py-1 animate-fade-in">
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Image Not Delivered</p>
                <p className="mt-0.5 leading-relaxed">{state.message}</p>
              </div>
            </div>
            <button
              onClick={() => setState({ phase: "idle" })}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink transition hover:bg-surface-active"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Choose another image</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
