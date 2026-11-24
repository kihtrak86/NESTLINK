# 🔖 NestLink AI — Smart Bookmark Manager (Phase 1 + Phase 2)

![React](https://img.shields.io/badge/Frontend-React.js-61DAFB?logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Styling-TailwindCSS-38B2AC?logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Framework-Express.js-000000?logo=express&logoColor=white)
![FastAPI](https://img.shields.io/badge/AI_Service-FastAPI-009688?logo=fastapi&logoColor=white)
![MongoDB](https://img.shields.io/badge/Database-MongoDB_Atlas-47A248?logo=mongodb&logoColor=white)

## 📌 Overview

**NestLink** is a full-stack smart bookmark manager that lets users save, organize, and retrieve website links using custom folders, tags, keyword search, **Phase 1 AI Semantic Search**, and **Phase 2 Intelligent Bookmark Understanding**.

- **Phase 1 (Preserved)**: User authentication (JWT + bcrypt), Resend password recovery, CRUD for bookmarks/folders/tags, keyword search, 384-dimensional embeddings (`sentence-transformers/all-MiniLM-L6-v2`), MongoDB Atlas Vector Search, and batched embedding backfill.
- **Phase 2 (New)**: Automatic SSRF-hardened webpage metadata & content extraction, provider-independent LLM bookmark summaries (Gemini API initial provider), structured AI tag suggestions preferring existing user tags, and intelligent folder recommendations — all processed asynchronously without blocking bookmark creation, while keeping users strictly in control of accepting or rejecting AI suggestions.

---

## 🏗️ System & Phase 2 Processing Architecture

```text
React Frontend (Dashboard, BookmarkModal, BookmarkCard, BookmarkDetailsModal)
        │
        ▼
Node.js / Express Backend
  ├── Bookmark CRUD (saves immediately, returns 201)
  ├── Phase 2 AI Insights API (JWT auth + ownership checks + per-user rate limits)
  ├── Background AI Processing Queue (in-process async, deduplicated, retries, partial failures)
  │     1. URL & SSRF Validation (HTTP/HTTPS only, DNS & redirect-hop private IP blocking)
  │     2. Webpage Metadata & Content Extraction (timeout, 1.5MB cap, no JS, LRU/TTL cache)
  │     3. Provider-Independent LLM Layer (Gemini API via GEMINI_API_KEY)
  │        ├── Concise 2–4 Sentence Grounded Summary
  │        ├── 3–5 Normalized Structured Tag Suggestions
  │        └── Folder Recommendation (existing folder or new suggestion + reason)
  │     4. MongoDB Bookmark Update (scoped by { _id, user })
  │     5. 384-dim Embedding Refresh (via FastAPI Embedding Service when content hash changes)
  │
  ├──► Python FastAPI Embedding Service (sentence-transformers/all-MiniLM-L6-v2, 384 dims)
  └──► MongoDB Atlas + Atlas Vector Search (bookmark_vector_index)
```

---

## ✨ Features

### Phase 1 Features (Unchanged)
- **Authentication & Security**: Signup, login, JWT-protected routes, bcrypt password hashing, and Resend password recovery.
- **AI Semantic Search**: Natural-language search powered by `sentence-transformers/all-MiniLM-L6-v2` and MongoDB Atlas Vector Search (`cosine` similarity) strictly isolated per user.
- **Keyword & Filter Parity**: Instant switching between Keyword Search and AI Search, folder/tag filters, pagination, and dark/light themes.
- **Batched Embedding Backfill**: CLI script (`npm run backfill:embeddings`) for existing bookmarks.

### Phase 2 Features (New)
- **Automatic Webpage Metadata Extraction**: Extracts title, description, Open Graph title/description/image, favicon, canonical URL, domain, author, publication date, and clean readable article text while stripping scripts, styles, navigation, and ads.
  - **Security**: HTTP/HTTPS only, strict SSRF protection (blocks `localhost`, private IPv4/IPv6 ranges, link-local/cloud metadata IPs, internal hostnames, DNS rebinding, and redirect hops), strict timeouts, response byte limits, zero JS execution, and bounded LRU/TTL caching.
  - **Pre-save Preview**: Users can click **Fetch info** in the Add Bookmark modal to preview/populate title and description before saving.
- **AI-Generated Bookmark Summaries**: Generates concise 2–4 sentence grounded summaries explaining the main subject and usefulness of each saved resource, with clear fallbacks when content is sparse and on-demand regeneration.
- **Intelligent Tag Suggestions**: Suggests 3–5 normalized structured tags per bookmark, preferring the user's existing tags and never automatically overwriting user-selected tags. Users can accept, edit before accepting, or reject suggestions.
- **Intelligent Folder Recommendations**: Evaluates existing user folders (names and optional descriptions) to recommend the best match — or proposes a new folder name with a brief explanation. Never moves bookmarks or creates duplicate folders without explicit user approval.

---

## 🗄️ Database Schema Changes (Phase 2)

All Phase 1 fields on `Bookmark` (`user`, `title`, `description`, `url`, `folder`, `tags`, hidden `embedding`, `embeddingModel`, `embeddingContentHash`, `embeddingUpdatedAt`) are preserved intact.

### Added to `Bookmark` (`server/models/Bookmark.js`)
- `extractedMetadata`: `{ title, description, ogTitle, ogDescription, ogImage, favicon, canonicalUrl, domain, author, publishedAt, textPreview (max 4000 chars), extractedAt }`
- `aiSummary`: `{ text (max 1500 chars), status ("idle"|"generated"|"fallback"|"failed"), provider, model, updatedAt }`
- `suggestedTags`: `[{ name, normalized, status ("pending"|"accepted"|"rejected"), isExistingUserTag }]`
- `suggestedFolder`: `{ name, isNewFolder, reason, status ("none"|"pending"|"accepted"|"rejected"), updatedAt }`
- `processingStatus`: `"idle" | "pending" | "extracting" | "analyzing" | "completed" | "partial" | "failed"`
- `lastProcessedAt`: `Date`
- `contentHash`: `String` (`select: false` — avoids redundant reprocessing of unchanged pages)
- `aiProcessingError`: `{ stage, message, retryCount, occurredAt }` (sanitized error details)
- **New Indexes**: `{ user: 1, processingStatus: 1 }` and `{ user: 1, url: 1 }`

### Added to `Folder` (`server/models/Folder.js`)
- `description`: optional `String` (max 300 chars) used to improve folder recommendation accuracy.

---

## 🔐 Environment Variables & Gemini API Configuration

### 1. Express Backend (`server/.env`)

Copy `server/.env.example` to `server/.env` and fill in your credentials (never commit `.env`):

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/nestlink?retryWrites=true&w=majority
CLIENT_URL=http://localhost:5173
JWT_SECRET=change_this_to_a_long_random_secret_string
JWT_EXPIRES_IN=7d
RESEND_API_KEY=re_your_resend_api_key

# Phase 1: AI Semantic Search & Embedding Service
EMBEDDING_SERVICE_URL=http://localhost:8000
EMBEDDING_API_KEY=
EMBEDDING_TIMEOUT_MS=15000
EMBEDDING_DIMENSIONS=384
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ATLAS_VECTOR_INDEX_NAME=bookmark_vector_index
SEMANTIC_MIN_SCORE=0

# Phase 2: Intelligent Bookmark Understanding
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
LLM_TIMEOUT_MS=20000
AI_AUTO_PROCESS=true
AI_COMBINED_PROMPT=true

# Metadata Extraction & Caching
METADATA_FETCH_TIMEOUT_MS=8000
METADATA_MAX_RESPONSE_BYTES=1500000
METADATA_MAX_REDIRECTS=5
METADATA_CACHE_TTL_MS=3600000
METADATA_CACHE_MAX_ENTRIES=200

# Per-User Rate Limits
AI_RATE_LIMIT_WINDOW_MS=60000
AI_RATE_LIMIT_MAX_REQUESTS=20
EXTRACT_RATE_LIMIT_MAX_REQUESTS=30
```

#### Obtaining a Gemini API Key
1. Open Google AI Studio and generate an API key.
2. Set `GEMINI_API_KEY` in `server/.env` (local) and in Render's Environment tab (production).
3. Optional: switch models via `GEMINI_MODEL` (defaults to `gemini-3.5-flash-lite`) or register another provider via `server/services/llm/llmProvider.js` and `LLM_PROVIDER`.

### 2. Python Embedding Service (`embedding-service/.env`)
Unchanged from Phase 1 (see `embedding-service/.env.example`).

### 3. React Frontend (`client/.env`)
Unchanged from Phase 1 (`VITE_API_URL=http://localhost:5000/api`).

---

## 🚀 Installation & Local Development

### 1. Start the Python FastAPI Embedding Service
```bash
cd embedding-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. Start the Node.js / Express Backend
```bash
cd server
npm install
cp .env.example .env        # fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm run dev
```

### 3. Start the React Frontend
```bash
cd client
npm install
cp .env.example .env
npm run dev
```

### Running Tests
```bash
# Backend unit & integration tests (Phase 1 + Phase 2)
cd server
npm test

# Frontend AI insights helper tests
cd client
node --test src/utils/aiInsightsHelpers.test.mjs

# Python embedding service tests
cd embedding-service
pytest -v
```

---

## 📡 API Endpoint Documentation

All `/api/bookmarks/*` endpoints require `Authorization: Bearer <jwt>` and strictly scope data to the authenticated user.

### Phase 1 Endpoints (Preserved)
- `GET /api/bookmarks` — Paginated bookmark list with keyword search (`title`, `description`, `folder`, `tags`, and `aiSummary.text`), folder, and tag filters.
- `GET /api/bookmarks/semantic-search?q=...` — Atlas Vector Search semantic retrieval.
- `GET /api/bookmarks/tags` — Distinct confirmed tags for the user.
- `POST /api/bookmarks` — Create bookmark (saves immediately and queues background Phase 2 processing).
- `PUT /api/bookmarks/:id` — Update bookmark (preserves user edits; re-processes if URL changes).
- `DELETE /api/bookmarks/:id` — Delete bookmark and cancel any in-flight Phase 2 job.

### Phase 2 Endpoints (New)
| Method | Endpoint | Rate Limited | Description |
|---|---|---|---|
| `POST` | `/api/bookmarks/extract-preview` | Yes | Extract webpage metadata preview for `{ url }` prior to saving |
| `GET` | `/api/bookmarks/:id/ai-insights` | No | Retrieve extracted metadata, AI summary, tag/folder suggestions, and status |
| `GET` | `/api/bookmarks/:id/processing-status` | No | Lightweight polling endpoint for background job status |
| `POST` | `/api/bookmarks/:id/process` | Yes | Trigger or retry the full Phase 2 pipeline (`202 Accepted`) |
| `POST` | `/api/bookmarks/:id/extract` | Yes | Re-run webpage metadata extraction for a bookmark |
| `POST` | `/api/bookmarks/:id/summary/regenerate` | Yes | Regenerate AI summary and refresh semantic embedding |
| `POST` | `/api/bookmarks/:id/tags/suggest` | Yes | Generate fresh 3–5 structured tag suggestions |
| `PATCH` | `/api/bookmarks/:id/tags/suggestions` | No | Accept, edit-and-accept, or reject tag suggestions (`action`: `accept`, `reject`, `accept_all`, `reject_all`) |
| `POST` | `/api/bookmarks/:id/folder/recommend` | Yes | Generate an intelligent folder recommendation |
| `PATCH` | `/api/bookmarks/:id/folder/recommendation` | No | Accept (moves bookmark, creates folder if new without duplicates) or reject folder recommendation |

---

## ☁️ Deployment Instructions (Vercel + Render + MongoDB Atlas)

1. **MongoDB Atlas**: No changes required to the existing `bookmark_vector_index` (384 dims, cosine, `user` filter). New secondary indexes are created automatically by Mongoose.
2. **Render — Express Backend**:
   - Deploy `server/` as a Node Web Service (`npm install`, `npm start`).
   - Add `GEMINI_API_KEY` (and optional `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`) in Render's **Environment** settings alongside your existing Phase 1 variables.
3. **Render — FastAPI Embedding Service**: Unchanged from Phase 1.
4. **Vercel — React Frontend**: Deploy `client/` with `VITE_API_URL` pointing to your Render Express API URL.

---

## ⚠️ Known Limitations

- **Static HTML Extraction Only**: By design (for security and resource efficiency), NestLink does not execute JavaScript from scraped webpages. Heavy client-side SPAs or bot-protected/paywalled sites may yield limited extracted text, in which case NestLink falls back gracefully to bookmark title/description or a clear fallback message.
- **In-Process Queue & Cache**: The background job queue, rate-limit buckets, and metadata LRU cache live in Node.js process memory for zero-infrastructure compatibility with single-instance Render deployments. If the server restarts mid-job, pending/failed bookmarks can be retried from the UI (**Re-analyze page**) or `POST /api/bookmarks/:id/process`.
- **External API Dependency**: Summary, tag, and folder generation require a valid `GEMINI_API_KEY` and outbound connectivity to the Gemini API; bookmark CRUD, metadata extraction, and Phase 1 semantic search continue working normally if the LLM provider is unavailable.
