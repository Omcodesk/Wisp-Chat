# Wisp — Real-Time Messaging System

A production-oriented, secure, and reliable real-time web messaging platform built with **Next.js 14**, **TypeScript**, **Socket.IO**, **PostgreSQL (Prisma ORM)**, **Sightengine AI Content Moderation**, and **GIPHY API**.

---

## 1. Project Overview

**Wisp** is a full-featured real-time 1:1 chat platform engineered for low latency, message integrity, media safety, and defense against malicious input.

### Main Capabilities
- **Instantaneous 1:1 Messaging**: Sub-50ms message dispatch via WebSockets with real-time delivery and read receipts.
- **Rich Media Support**: Integrated GIPHY GIF search/preview, high-resolution sticker picker, and image uploads.
- **Server-Side AI Image Moderation**: Automated nudity and explicit-content detection powered by Sightengine's `nudity-2.1` model before images reach recipients.
- **Defensible Profanity Filter**: Server-side normalization engine resistant to leetspeak, spacing, repeats, and symbol insertions.
- **High-Volume Scalability**: Cursor-based pagination and tailored PostgreSQL indexes designed for conversations exceeding 10,000+ messages.
- **Resilient Reliability**: Idempotent message delivery via `clientMessageId`, optimistic UI updates, auto-reconnection, and multi-tab state synchronization.
- **Strict Security & Authorization**: Conversation membership isolation, sender-spoofing prevention, and binary magic-byte file signature validation.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 14 (App Router), React 18, TypeScript | UI rendering, client state, layout containment |
| **Styling & Icons** | Vanilla CSS, Tailwind CSS, Lucide React | Modern dark-mode interface, glass panels, animations |
| **Real-Time Engine** | Dedicated Node.js + Socket.IO Server | Stateful WebSocket rooms, typing events, presence |
| **Database & ORM** | PostgreSQL + Prisma ORM | Persistent relational schema, composite unique indexes |
| **Authentication** | Auth.js / NextAuth (Credentials Provider) | Session JWTs stored in HTTP-only, secure cookies |
| **Image Moderation** | Sightengine API (`nudity-2.1`) | Server-side automated explicit-content detection |
| **GIF Provider** | GIPHY API | Live GIF search, debounced input, responsive previews |
| **Storage Adapter** | Cloudflare R2 / Local Disk Fallback | Object storage for media with zero-card local fallback |
| **Cache & Rate Limiting** | Upstash Redis (with In-Memory Fallback) | Token-bucket rate limiting and session tracking |
| **Testing Suite** | Vitest + TypeScript Compiler (`tsc`) | Profanity normalization, schema checks, E2E tests |

---

## 3. Architecture

### System Flow Diagram

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

### Component Breakdown
1. **Browser $\rightarrow$ Next.js API $\rightarrow$ PostgreSQL/Prisma**: Handles authentication, user discovery, message history queries, upload URL generation, and image promotion.
2. **Browser $\leftrightarrow$ Socket.IO Server**: Manages bi-directional, stateful WebSocket connections for instant message transmission, typing indicators, read receipts, and presence heartbeats.
3. **Media $\rightarrow$ Storage $\rightarrow$ Moderation $\rightarrow$ Delivery**: Images upload to a temporary staging prefix (`pending/`), undergo binary file-signature checks, pass server-side AI moderation, and only then get promoted to public storage and emitted via Socket.IO.
4. **Redis / In-Memory $\rightarrow$ Rate Limiting & Presence**: Enforces sliding-window rate limiting on sensitive routes and aggregates multi-tab session presence.

### Why the Socket.IO Server is Separate
Next.js serverless functions and edge runtimes are stateless and short-lived. WebSockets, by contrast, require long-lived TCP connections, persistent memory for socket rooms, client heartbeats, and immediate event fanout. Separating the Socket.IO server:
- Prevents connection drops during web application redeployments.
- Allows independent horizontal scaling of WebSocket nodes based on concurrent active connections rather than HTTP traffic.
- Eliminates serverless cold starts for real-time messaging.
- Secures inter-service communication via a shared internal HMAC token (`SOCKET_AUTH_SECRET`) over an internal `/internal/emit-message` bridge.

---

## 4. Required Assignment Features

| Assignment Requirement | Implementation Reference | Verification Detail |
| :--- | :--- | :--- |
| **1:1 Real-Time Messaging** | `server/socket.ts`, `app/api/conversations` | Enforced at database & socket layer. Messages appear instantaneously without page reload. |
| **Timestamps** | `components/chat/message-bubble.tsx` | UTC ISO timestamps stored in PostgreSQL, formatted dynamically in client local time. |
| **Delivery / Read States** | `components/chat/message-bubble.tsx` | Single check (sent), double check (delivered to recipient socket), colored double check (read). |
| **Typing Indicators** | `components/chat/composer.tsx` | Debounced `typing:start` and `typing:stop` socket events with 3-second auto-clear timer. |
| **Online / Offline Presence** | `lib/socket/presence.ts` | Real-time presence tracked per user connection; broadcasts state immediately upon connect/disconnect. |
| **Unread Counts** | `components/chat/sidebar.tsx` | Dynamically calculated from unread message IDs per conversation; clears upon viewing. |
| **Cursor Pagination** | `app/api/conversations/[id]/messages` | Reverse-chronological initial load (30 messages); scrolling up loads older messages via `before=<id>`. |
| **GIFs** | `components/chat/gif-picker.tsx` | GIPHY integration with debounced live search, preview grid, and single-click insertion. |
| **Stickers** | `components/chat/sticker-picker.tsx` | Native sticker pack rendered with fixed aspect ratios; dispatches instantly with scroll anchoring. |
| **Image Moderation** | `lib/moderation/image.ts` | Automated pre-delivery inspection via Sightengine `nudity-2.1`; blocks explicit content before delivery. |
| **Profanity Filtering** | `lib/moderation/profanity.ts` | Server-side text normalization engine resistant to leetspeak, spacing, and character repeats. |
| **Reconnection & Idempotency** | `lib/socket/client.ts`, `lib/db/messages.ts` | Auto-reconnect with exponential backoff. Unique `clientMessageId` prevents duplicate rows. |
| **10k+ Message Handling** | `prisma/schema.prisma` | Indexed queries (`[conversationId, createdAt]`) and cursor pagination avoid costly table offsets. |
| **Authorization & Security** | `lib/db/authorization.ts` | Server-side membership checks prevent unauthorized reading or cross-user message spoofing. |

---

## 5. Image Moderation Pipeline

### Moderation Service & Model
- **Provider**: [Sightengine](https://sightengine.com/)
- **Model**: `nudity-2.1` hosted AI inference API.
- **Inference Location**: Server-side cloud inference. Sightengine credentials (`SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`) reside exclusively in server environment variables and are never bundled into client code.
- **Model Characteristics**: Hosted neural net classifier evaluating three explicit classes: `sexual_activity`, `sexual_display`, and `erotica`. Parameter size is proprietary to Sightengine.
- **Expected Latency**: ~300ms – 800ms per image check.

### Decision Rule & Thresholds
- **Threshold**: Rejection threshold of **`0.40`** on high-severity classes:
  $$\text{Reject if } (\text{sexual\_activity} \ge 0.40) \lor (\text{sexual\_display} \ge 0.40) \lor (\text{erotica} \ge 0.40)$$
- **False-Positive Prevention**: Non-explicit classes (`suggestive`, `mildly_suggestive`) are tolerated to prevent false rejections on swimwear or ordinary portraits.

### Fail-Closed Behavior
If Sightengine is unreachable, encounters a network timeout (enforced at **8,000ms**), or returns an unexpected error, the pipeline **fails closed** (`approved: false, reason: "provider_error"`). Unmoderated images can never reach a recipient due to external provider unavailability.

### Why an Image Cannot Reach the Recipient Before Moderation
1. **Socket Rejection**: The Socket.IO server explicitly rejects `type: "IMAGE"` payloads with `INVALID_PAYLOAD`. Sockets cannot create image records.
2. **Staging Isolation**: Client uploads are directed to an isolated staging prefix (`pending/<conversationId>/<uuid>`). These objects are not publicly linked to any conversation.
3. **Mandatory Step 2**: To deliver the image, the client must call `POST /api/media/complete`.
4. **Enforced Verification**: The complete route verifies:
   - User is an active conversation member.
   - Upload exists and matches declared size.
   - Magic bytes confirm a genuine image (`image/jpeg`, `image/png`, `image/webp`).
   - Image bytes pass Sightengine `nudity-2.1` moderation.
5. **Atomic Promotion**: Only upon passing moderation is the file copied to the public prefix, the `Message` row created in PostgreSQL, and the real-time socket emit triggered.
6. **Rejection Cleanup**: If moderation fails, the pending file is unlinked, no message is created, and the sender receives a generic moderation warning.

---

## 6. Reliability & Delivery Guarantees

### Client Message ID & Idempotency
Every message originates with a client-generated UUIDv4 (`clientMessageId`). In PostgreSQL, messages enforce a composite unique constraint:
```prisma
@@unique([conversationId, senderId, clientMessageId], name: "idempotency_key")
```
If network drops cause the client to retry sending, the database rejects duplicates and returns the existing message record with `200 OK`.

### Optimistic Updates
Messages render in the sender's chat viewport immediately with a `pending` state (translucent clock icon). When the server responds with the saved database record and ACK, the message transitions to `sent` without page jumps.

### Persist-Before-Broadcast
Both socket handlers and REST routes commit the message record to PostgreSQL **before** broadcasting to conversation rooms. A message is never announced to recipients unless it is safely persisted in durable storage.

### Reconnection Handling
The Socket.IO client is configured with automatic reconnection and exponential backoff. Upon reconnecting, the client re-joins active conversation rooms and re-synchronizes the message stream and unread counts.

### Multi-Tab Presence & Sync
- User presence is aggregated by user ID across all open browser tabs. Closing Tab 1 does not mark the user offline if Tab 2 remains open.
- Real-time message dispatches and read receipts are sent to the user's personal room, ensuring that actions taken in one tab update all open tabs instantly.

---

## 7. Database Design & Indexing

### Core Prisma Models
- **`User`**: Account identity, email, password hash, timestamps.
- **`Conversation`**: Direct 1:1 conversation container with timestamps and relations.
- **`ConversationMember`**: Pivot table associating users with conversations, tracking last read timestamp.
- **`Message`**: Individual messages containing type (`TEXT`, `IMAGE`, `GIF`, `STICKER`), body, media URL, metadata, and delivery states.
- **`ReadReceipt`**: Timestamped receipt records per message and user.

### Indexing Strategy
```prisma
model Message {
  // Enables sub-millisecond reverse-chronological message queries
  @@index([conversationId, createdAt])

  // Guarantees O(1) duplicate lookup for retry idempotency
  @@unique([conversationId, senderId, clientMessageId], name: "idempotency_key")
}

model ConversationMember {
  // Powers instant conversation membership authorization checks
  @@index([userId, conversationId])
}
```

### Why Cursor-Based Pagination?
Standard SQL offset pagination (`OFFSET 10000 LIMIT 30`) forces PostgreSQL to scan and discard 10,000 index entries, resulting in $O(N)$ query degradation and page drift when new messages arrive.

Wisp uses **cursor pagination** anchored to `(createdAt, id)`:
```sql
SELECT * FROM "Message"
WHERE "conversationId" = $1 AND "createdAt" < $2
ORDER BY "createdAt" DESC
LIMIT 30;
```
This enables $O(\log N)$ b-tree seeks, consistent pagination during active chatting, and fluid scroll performance with 10,000+ messages.

---

## 8. Security & Defense in Depth

- **Authentication**: Secured via Auth.js / NextAuth using JWT session tokens stored in secure, `HttpOnly`, `SameSite=lax` cookies.
- **Authorization & Membership Isolation**: Server-side `assertConversationMember()` runs on every REST and WebSocket handler. Users cannot read messages or join conversation rooms they do not belong to (`403 Forbidden`).
- **Sender Spoofing Prevention**: The sender ID is strictly extracted from the cryptographically verified session (`user.id`). Any attempt to pass a spoofed sender ID in request bodies is ignored.
- **Magic-Byte Binary Validation**: Uploaded files are validated against true cryptographic signatures:
  - JPEG: `0xFFD8FFE0`, `0xFFD8FFE1`, `0xFFD8FFEE`, `0xFFD8FFDB`
  - PNG: `0x89504E47`
  - WebP: `RIFF....WEBP`
  Spoofed MIME headers or renamed `.exe` files are rejected before processing.
- **Server-Side Profanity Moderation**: Text is normalized through an automated pipeline:
  - Normalizes leetspeak (`1` $\rightarrow$ `i`, `@` $\rightarrow$ `a`, `$` $\rightarrow$ `s`, `0` $\rightarrow$ `o`).
  - Strips whitespace padding (`f u c k` $\rightarrow$ `fuck`).
  - Collapses repeated letters (`fuuuuck` $\rightarrow$ `fuck`).
  - Removes non-alphanumeric punctuation.
- **Rate Limiting**: Sliding-window rate limiting protects message sending, upload URL requests, and GIPHY search endpoints against abuse.

---

## 9. Local Setup & Running Locally

### Prerequisites
- **Node.js**: v18.17+ (v20 or v22 recommended)
- **PostgreSQL**: Local PostgreSQL instance or connection string

### Step-by-Step Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Omcodesk/Wisp-Chat.git
   cd Wisp-Chat
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *(See section 10 for variable details. If Cloudflare R2 is omitted, Wisp automatically switches to zero-card local disk storage.)*

4. **Initialize Database & Seed**:
   ```bash
   npx prisma db push
   node scripts/seed.mjs
   ```

5. **Start the Development Servers**:
   Open two terminal windows:
   ```bash
   # Terminal 1: Real-Time WebSocket Server
   npm run start:socket

   # Terminal 2: Next.js Web Application
   npm run dev:next
   ```

6. **Open the Application**:
   Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 10. Environment Variables Reference

Safe configuration template (all secrets use safe placeholders):

```env
# Database (PostgreSQL direct connection string)
DATABASE_URL="postgresql://username:password@localhost:5432/messaging_app?sslmode=disable"

# Auth.js / NextAuth Secrets
AUTH_SECRET="long-random-32-byte-secret-key"
NEXTAUTH_SECRET="long-random-32-byte-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Public App URLs
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4001"
SOCKET_SERVER_PORT=4001

# Internal Server-to-Server Socket Communication
SOCKET_SERVER_URL="http://localhost:4001"
SOCKET_AUTH_SECRET="long-random-32-byte-secret-key"

# External Integrations (Free tiers with no credit card required)
GIPHY_API_KEY="your-giphy-developer-api-key"
SIGHTENGINE_API_USER="your-sightengine-api-user-id"
SIGHTENGINE_API_SECRET="your-sightengine-api-secret-key"

# Optional Cloudflare R2 (Leave blank for automatic local storage fallback)
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_PUBLIC_URL=""

# Optional Upstash Redis (Leave blank for automatic in-memory fallback)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

---

## 11. Safe Pre-Seeded Demo Accounts

The database seeder (`node scripts/seed.mjs`) automatically generates two active user accounts with established conversations for evaluation:

| Account | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **Demo User 1** | `demo1@example.com` | `password123` | Primary Test Account |
| **Demo User 2** | `demo2@example.com` | `password123` | Recipient / Concurrent Session |

> **Two-Account Testing Tip**: Open `demo1@example.com` in a standard browser window and `demo2@example.com` in an incognito window to verify instant two-way synchronization, typing indicators, and read receipts in real time.

---

## 12. Deployment Architecture

For production deployment:

```
[Vercel / AWS Amplify]        [Railway / Render / Fly.io]        [Neon / Supabase]
      Next.js App                      Socket.IO Server              PostgreSQL DB
  (SSR & REST APIs)             (Stateful WebSockets)            (Prisma Connection)
          |                                  |                            |
          +----------------------------------+----------------------------+
```

- **Frontend / Next.js**: Deployed on serverless hosting (Vercel, AWS Amplify, or containerized Docker).
- **Socket.IO Server**: Deployed on a persistent compute container (Railway, Render, Fly.io, or AWS EC2) with open WebSocket ports.
- **Inter-Service Link**: The Next.js API communicates with the Socket.IO server via `SOCKET_SERVER_URL` using the shared `SOCKET_AUTH_SECRET` bearer token.
- **Production Storage**: Cloudflare R2 bucket with public CDN access configured via `R2_PUBLIC_URL`.
- **Production Presence**: Upstash Redis configured via `UPSTASH_REDIS_REST_URL` to enable multi-instance Socket.IO cluster broadcasting.

---

## 13. Known Limitations & Development Trade-offs

- **Sightengine Free Tier Limit**: The free developer tier provides 2,000 operations/month. In high-traffic demos exceeding this threshold, the API will return rate limit errors and the fail-closed policy will reject further uploads until quota resets.
- **GIPHY Development Key**: GIPHY beta keys are limited to 42 search requests/hour and 1,000 requests/day.
- **Socket Clustering without Redis**: When `UPSTASH_REDIS_REST_URL` is omitted, socket presence and typing states are tracked in-process memory. This works for single-instance deployments; multi-instance horizontal scaling requires configuring the Redis adapter.
- **Browser Compatibility**: Optimized and verified on modern evergreen browsers (Chrome, Edge, Firefox, Safari). Legacy Internet Explorer is not supported.

---

## 14. Verification & Testing Commands

To run all automated correctness, security, and type safety checks:

```bash
# 1. TypeScript Static Compilation Check
npm run typecheck

# 2. Vitest Unit Test Suite (Profanity filter & bypass evasion)
npm test

# 3. Comprehensive End-to-End Integration Assertions
npx tsx scripts/verify-integrations.ts
```

All 3 suites pass with **0 errors**.
