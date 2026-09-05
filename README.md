# Wisp — Real-Time Messaging System

A production-grade, secure, and resilient real-time web messaging system built with **Next.js 14**, **TypeScript**, **Socket.IO**, **PostgreSQL (Prisma ORM)**, **Sightengine AI Content Moderation**, and **GIPHY API**.

---

## System Architecture

```
                                  +-----------------------+
                                  |   Web Browser Client  |
                                  |  (React 18 / Next.js) |
                                  +-----------+-----------+
                                              |
                     +------------------------+------------------------+
                     | HTTP / REST                                      | WebSockets (WSS)
                     v                                                  v
         +-----------------------+                         +-------------------------+
         |  Next.js 14 API Layer |                         | Dedicated Socket Server |
         |   (Auth, Media, DB)   |                         |  (Rooms, Presence, ACK) |
         +-----------+-----------+                         +------------+------------+
                     |                                                  |
                     |-------- Internal Secret Emit (/internal) --------|
                     |
         +-----------+-----------+----------------------+
         |                       |                      |
         v                       v                      v
+-----------------+     +-----------------+    +------------------+
|   PostgreSQL    |     |   Sightengine   |    | Cloudflare R2 /  |
|  (Prisma ORM)   |     | (AI Moderation) |    |  Local Storage   |
+-----------------+     +-----------------+    +------------------+
```

---

## Requirements Verification & Feature Matrix

### 1. Real-Time Messaging
- **1:1 Direct Conversations**: Enforced at database schema and API layer with composite unique constraints across participant pairs.
- **Real-Time Delivery**: Dedicated Socket.IO server (`server/socket.ts`) broadcasting message payloads across conversation rooms with immediate ACK.
- **Timestamps**: UTC ISO timestamps stored in PostgreSQL (`createdAt`) and localized dynamically in the client UI.
- **Delivery & Read States**: 
  - `Sent` (single checkmark): Accepted by server.
  - `Delivered` (double checkmark): Emitted to active recipient socket.
  - `Read` (colored double checkmark): Marked via `/api/conversations/[id]/read` upon recipient viewport entry.
- **Typing Indicators**: Ephemeral `typing:start` and `typing:stop` socket events with a 3-second auto-expiry timeout to prevent stuck states.
- **Online / Offline Presence**: Real-time presence tracked per user connection with instantaneous state broadcast on connect/disconnect.
- **Unread Counts**: Computed dynamically from unread message IDs per conversation; clears automatically upon viewing.
- **Message Loading & Cursor Pagination**: Initial load retrieves the latest 30 messages anchored at the bottom; scrolling upward loads older messages via cursor-based query (`before=<messageId>`).
- **Simultaneous Two-Account Demo**: Verified with two concurrent accounts (`demo1@example.com` and `demo2@example.com`) across independent browser contexts.

---

### 2. GIFs and Stickers
- **GIF Picker with Search & Preview**: Integrated with the GIPHY API (`components/chat/gif-picker.tsx`). Features debounced input, responsive grid preview, and single-click insertion.
- **Sticker Picker**: Native, high-resolution sticker pack (`components/chat/sticker-picker.tsx`) with immediate transmission and automatic scroll anchoring.
- **UI Performance**: Fixed aspect ratio containers, CSS containment, and lazy image rendering prevent layout shifts and jank during scrolling.

---

### 3. Image Upload & AI Nudity Detection
- **Pipeline Architecture**:
  1. Client requests presigned upload reference via `POST /api/media/upload-url`.
  2. Direct binary upload to staging (`pending/` prefix) in Cloudflare R2 or local disk storage.
  3. Client calls `POST /api/media/complete` with `clientMessageId`.
  4. Server performs cryptographic magic-byte verification.
  5. Server runs automated AI moderation against the pending object before committing to the database.
  6. On approval: Object is promoted to public chat, message record is committed, and real-time socket delivery triggers.
  7. On rejection: File is discarded immediately, no message is created, and sender receives an inline notification.

#### Moderation Model Details (Sightengine `nudity-2.1`)
- **Service & Model**: Sightengine hosted inference API (`nudity-2.1`).
- **Inference Location**: Runs server-side. Sightengine API credentials (`SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`) are stored in server environment variables and never exposed to the client bundle.
- **Model Size**: Proprietary cloud-hosted model; weights are not published by Sightengine.
- **Expected Latency**: ~300ms – 800ms.
- **Threshold & Decision Policy**:
  - Rejection Rule: `sexual_activity >= 0.40 OR sexual_display >= 0.40 OR erotica >= 0.40`.
  - Non-explicit classes (`suggestive`, `mildly_suggestive`) are tolerated to avoid false positives on ordinary photos.
- **Failure Behavior (Fail-Closed)**: If the moderation provider is unreachable, times out (8000ms), or returns an error, the upload is **strictly rejected**.
- **Non-Bypassable Guarantee**: The Socket.IO server explicitly rejects `type: "IMAGE"` messages (`INVALID_PAYLOAD`). Image messages can **only** be created by the authenticated `/api/media/complete` route after passing file-signature checks and AI moderation.

---

### 4. Profanity / Curse Word Moderation
- **Pre-Delivery Server-Side Blocking**: Evaluated before database commit or socket emission in `lib/moderation/profanity.ts`.
- **Evasion & Bypass Resistance**:
  - **Leetspeak substitutions**: Normalizes `@` $\rightarrow$ `a`, `1` / `!` $\rightarrow$ `i`, `$` $\rightarrow$ `s`, `0` $\rightarrow$ `o`, `3` $\rightarrow$ `e`, `7` $\rightarrow$ `t`, `5` $\rightarrow$ `s`.
  - **Whitespace padding**: Normalizes spaced attempts (e.g. `f u c k`).
  - **Repeated characters**: Collapses repeated character sequences (e.g. `fuuuck` $\rightarrow$ `fuck`).
  - **Punctuation & symbol interleaving**: Strips obfuscating delimiter symbols.
- **Automated Tests**: Comprehensive vitest suite (`__tests__/profanity.test.ts`) tests common bypass variants (`10/10 PASS`).

---

### 5. Messaging Reliability
- **WebSocket Reconnection**: Socket.IO client automatically reconnects with exponential backoff; unread message counts and missed messages re-sync upon reconnection.
- **Duplicate Prevention & Idempotency**:
  - Client assigns a unique `clientMessageId` (UUIDv4) to every message.
  - PostgreSQL enforces composite uniqueness:
    ```prisma
    @@unique([conversationId, senderId, clientMessageId], name: "idempotency_key")
    ```
  - Re-sending or retrying returns the existing message with `200 OK` without creating duplicates.
- **Optimistic UI Updates**: Messages appear immediately with pending status and transition to sent upon server ACK.
- **Multi-Tab Synchronization**: Real-time events are dispatched to user rooms. If User A sends a message in Tab 1, Tab 2 immediately reflects the message and marks it as sent.

---

### 6. Performance & Data Handling (10,000+ Message Scale)
- **Cursor-Based Pagination**: Employs `before=<messageId>` cursor pagination rather than high-offset SQL queries.
- **Optimized Database Indexes**:
  - `Message`: `@@index([conversationId, createdAt])` (sub-millisecond historical queries).
  - `Message`: `@@unique([conversationId, senderId, clientMessageId])` (O(1) idempotency lookup).
  - `ConversationMember`: `@@index([userId, conversationId])` (instant authorization checks).
- **Lazy Media Loading**: Native lazy loading and container constraints prevent layout shifts and memory spikes.
- **Direct Staged Storage**: Uploads avoid large request bodies through the main application server.

---

### 7. Security Requirements
- **Conversation Membership Isolation**: Every REST route and WebSocket handler enforces `assertConversationMember`. Attempting to read or emit to unauthorized rooms returns `403 Forbidden`.
- **Sender Identity Protection**: The sender ID is extracted directly from the verified session token (`user.id`), preventing sender spoofing.
- **Magic-Byte File Validation**: Validates cryptographic binary file signatures (`0xFFD8FFE0` for JPEG, `0x89504E47` for PNG, `RIFF....WEBP` for WebP). Spoofed file extensions or client MIME headers are rejected.
- **Authentication**: Built on Auth.js / NextAuth with HTTP-only, SameSite secure session cookies.

---

## Getting Started

### Prerequisites
- **Node.js**: v18+ (Node 20 or 22 recommended)
- **PostgreSQL**: Local or hosted database

### 1. Installation
```bash
git clone <your-repo-url>
cd webdev
npm install
```

### 2. Environment Configuration
Copy the template and fill in your configuration:
```bash
cp .env.example .env
```

Key environment variables:
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/messaging_app?sslmode=disable"

# Auth & Secrets
AUTH_SECRET="your-random-secret-key"
NEXTAUTH_SECRET="your-random-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Public URLs
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4001"
SOCKET_SERVER_PORT=4001
SOCKET_SERVER_URL="http://localhost:4001"
SOCKET_AUTH_SECRET="your-random-secret-key"

# External Integrations (Zero-Payment Options Supported)
GIPHY_API_KEY="your-free-giphy-key"
SIGHTENGINE_API_USER="your-free-sightengine-user"
SIGHTENGINE_API_SECRET="your-free-sightengine-secret"

# Optional Cloudflare R2 (Leaves empty to use automatic local storage fallback)
# R2_ACCOUNT_ID=""
# R2_ACCESS_KEY_ID=""
# R2_SECRET_ACCESS_KEY=""
# R2_BUCKET_NAME=""
# R2_PUBLIC_URL=""
```

> **Zero-Payment Setup**:
> If Cloudflare R2 credentials are not set, Wisp automatically enables its **Local Storage Fallback Adapter**, fully supporting image upload, magic-byte inspection, server-side AI moderation, and real-time delivery without requiring credit card registration.

### 3. Database Migration & Seed
```bash
npx prisma db push
node scripts/seed.mjs
```

### 4. Running the Application
Start the Socket.IO server and Next.js web application:
```bash
# Terminal 1: Realtime WebSocket Server
npm run start:socket

# Terminal 2: Next.js Web App
npm run dev:next
```

Visit **[http://localhost:3000](http://localhost:3000)**.

#### Demo Accounts
- **Account 1**: `demo1@example.com` / `password123`
- **Account 2**: `demo2@example.com` / `password123`

---

## Verification & Testing

Run all automated verification suites:

```bash
# Run TypeScript compilation check
npm run typecheck

# Run Vitest unit tests (Profanity normalization & bypasses)
npm test

# Run End-to-End Integration & Security Assertions
npx tsx scripts/verify-integrations.ts
```

All suites will report `PASS` with zero errors.
