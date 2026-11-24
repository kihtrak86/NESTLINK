# 🔖 NestLink — Intelligent Bookmark Manager








## 📌 Overview

**NestLink** is a full-stack intelligent bookmark manager and personal knowledge-management system. Users can save, organize, and retrieve links using custom folders, tags, keyword search, **AI Semantic Search**, and **automated webpage understanding**.

When a user saves a URL, NestLink saves the bookmark immediately and runs an asynchronous background pipeline that securely fetches webpage metadata and article content, generates a concise grounded AI summary, suggests normalized tags (prioritizing the user's existing taxonomy), recommends the best folder, and indexes a 384-dimensional vector embedding in **MongoDB Atlas Vector Search**—keeping the user in full control of accepting or rejecting AI suggestions.

---

## 🏗️ System Architecture

```text
React + Vite + Tailwind Frontend
        │
        ▼
Node.js / Express Backend
  ├── Auth & User Isolation (JWT + bcryptjs + Resend password recovery)
  ├── Bookmark & Folder CRUD (non-blocking save, returns 201 immediately)
  ├── AI Insights API (per-user sliding-window rate limits + ownership checks)
  ├── Asynchronous AI Processing Queue (in-flight deduplication, retries, partial failure recovery)
  │     1. URL & SSRF Validation (HTTP/HTTPS only, DNS resolution & redirect-hop private IP blocking)
  │     2. Webpage Metadata & Content Extraction (timeout, 1.5MB cap, no JS execution, LRU/TTL cache)
  │     3. Provider-Independent LLM Layer (Google Gemini API via GEMINI_API_KEY)
  │        ├── Concise 2–4 Sentence Grounded Summary
  │        ├── 3–5 Normalized Structured Tag Suggestions
  │        └── Folder Recommendation (existing folder match or new folder suggestion + rationale)
  │     4. MongoDB Bookmark Update (strictly scoped by { _id, user })
  │     5. 384-dim Embedding Refresh (content-hash gated)
  │
  ├──► Python FastAPI Embedding Service (sentence-transformers/all-MiniLM-L6-v2, 384 dims)
  └──► MongoDB Atlas + Atlas Vector Search (bookmark_vector_index)
```

---

## ✨ Key Features

- **AI Semantic Search**: Natural-language search powered by `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional L2-normalized vectors) and MongoDB Atlas Vector Search (`cosine` similarity) with strict per-user isolation.
- **Automatic Webpage Metadata Extraction**: Extracts title, description, Open Graph tags, favicon, canonical URL, domain, author, publication date, and clean readable article text while stripping scripts, styles, navigation, and ads. Includes a pre-save **Fetch info** preview in the bookmark modal.
- **SSRF-Hardened Fetching**: Restricts to `http://` and `https://`, blocks `localhost`, private IPv4/IPv6 ranges, link-local/cloud metadata IPs, internal hostnames, DNS rebinding, and unsafe redirect hops, with strict timeouts, streaming byte limits, zero JS execution, and bounded LRU/TTL caching.
- **AI-Generated Bookmark Summaries**: Produces concise 2–4 sentence grounded summaries explaining the subject and usefulness of each saved page, with sparse-content fallbacks, prompt-injection delimiters, and on-demand regeneration.
- **Intelligent Tag Suggestions**: Suggests 3–5 normalized structured tags per bookmark, preferring the user's existing tags and never overwriting user-selected tags. Users can accept, edit before accepting, or reject suggestions.
- **Intelligent Folder Recommendations**: Evaluates existing user folders (names and optional descriptions) to recommend the best match—or proposes a new folder with a brief rationale—without ever moving bookmarks or creating duplicate folders automatically.
- **Authentication & UX**: JWT authentication, bcrypt password hashing, Resend-powered password recovery, keyword & semantic search toggle, folder/tag filtering, pagination, and dark/light mode.

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Axios, React Router |
| **Backend API** | Node.js (18+), Express.js, Mongoose |
| **LLM Integration** | Provider-independent LLM layer (Google Gemini `gemini-3.5-flash-lite`) |
| **Embedding Microservice** | Python 3.11, FastAPI, Uvicorn, Sentence Transformers (`all-MiniLM-L6-v2`) |
| **Database & Vector Search** | MongoDB Atlas + MongoDB Atlas Vector Search (384 dims, cosine) |
| **Security & Auth** | JWT, bcryptjs, SSRF DNS/IP validator, per-user rate limiter |
| **Email & Hosting** | Resend, Vercel (Frontend), Render (Express API & FastAPI Service) |

---

## 🗄️ Database Schema Overview

### `Bookmark` (`server/models/Bookmark.js`)
- **Core Fields**: `user` (ObjectId, indexed), `title`, `description`, `url`, `folder`, `tags`
- **Vector Search Fields (`select: false`)**: `embedding` (384-dim `[Number]`), `embeddingModel`, `embeddingContentHash`, `embeddingUpdatedAt`
- **AI Understanding Fields**:
  - `extractedMetadata`: `{ title, description, ogTitle, ogDescription, ogImage, favicon, canonicalUrl, domain, author, publishedAt, textPreview (max 4000 chars), extractedAt }`
  - `aiSummary`: `{ text (max 1500 chars), status ("idle"|"generated"|"fallback"|"failed"), provider, model, updatedAt }`
  - `suggestedTags`: `[{ name, normalized, status ("pending"|"accepted"|"rejected"), isExistingUserTag }]`
  - `suggestedFolder`: `{ name, isNewFolder, reason, status ("none"|"pending"|"accepted"|"rejected"), updatedAt }`
  - `processingStatus`: `"idle" | "pending" | "extracting" | "analyzing" | "completed" | "partial" | "failed"`
  - `lastProcessedAt`, `contentHash` (`select: false`), `aiProcessingError`
- **Indexes**: `{ user: 1, createdAt: -1 }`, `{ user: 1, processingStatus: 1 }`, `{ user: 1, url: 1 }`

### `Folder` (`server/models/Folder.js`)
- `name`, `description` (optional, max 300 chars), `user` (case-insensitive unique index per user)

---

## 🔐 Environment Variables

### 1. Express Backend (`server/.env`)
Copy `server/.env.example` to `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/nestlink?retryWrites=true&w=majority
CLIENT_URL=http://localhost:5173
JWT_SECRET=change_this_to_a_long_random_secret_string
JWT_EXPIRES_IN=7d
RESEND_API_KEY=re_your_resend_api_key

# Semantic Search & Embedding Service
EMBEDDING_SERVICE_URL=http://localhost:8000
EMBEDDING_API_KEY=
EMBEDDING_TIMEOUT_MS=15000
EMBEDDING_DIMENSIONS=384
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ATLAS_VECTOR_INDEX_NAME=bookmark_vector_index
SEMANTIC_MIN_SCORE=0

# AI Understanding (LLM & Metadata Extraction)
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

### 2. Python Embedding Service (`embedding-service/.env`)
Copy `embedding-service/.env.example` to `embedding-service/.env` (`PORT=8000`, `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2`, `EMBEDDING_DIMENSIONS=384`).

### 3. React Frontend (`client/.env`)
Copy `client/.env.example` to `client/.env` (`VITE_API_URL=http://localhost:5000/api`).

---

## 🚀 Local Development Setup

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
cp .env.example .env        # add MONGO_URI, JWT_SECRET, GEMINI_API_KEY
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
# Backend tests (semantic search, SSRF & extraction, AI pipeline)
cd server
npm test

# Frontend AI insights helper tests
cd client
node --test src/utils/aiInsightsHelpers.test.mjs

# Python embedding service tests
cd embedding-service
pytest -v
```

### Embedding Backfill CLI
```bash
cd server
npm run backfill:embeddings -- --batch-size=25
```

---

## 📡 API Endpoints

All `/api/bookmarks/*` routes require `Authorization: Bearer <jwt>` and enforce strict user ownership.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bookmarks` | Paginated bookmark list with keyword search, folder, and tag filters |
| `GET` | `/api/bookmarks/semantic-search?q=...` | Natural-language vector search via MongoDB Atlas Vector Search |
| `GET` | `/api/bookmarks/tags` | Distinct confirmed tags for the authenticated user |
| `POST` | `/api/bookmarks` | Create bookmark and queue asynchronous AI analysis |
| `PUT` | `/api/bookmarks/:id` | Update bookmark (preserves user edits; refreshes AI/embedding when needed) |
| `DELETE` | `/api/bookmarks/:id` | Delete bookmark and cancel any in-flight background job |
| `POST` | `/api/bookmarks/extract-preview` | Extract webpage metadata preview for `{ url }` prior to saving |
| `GET` | `/api/bookmarks/:id/ai-insights` | Retrieve extracted metadata, AI summary, tag/folder suggestions, and status |
| `GET` | `/api/bookmarks/:id/processing-status` | Lightweight polling endpoint for background processing status |
| `POST` | `/api/bookmarks/:id/process` | Trigger or retry the full AI understanding pipeline (`202 Accepted`) |
| `POST` | `/api/bookmarks/:id/extract` | Re-run webpage metadata extraction |
| `POST` | `/api/bookmarks/:id/summary/regenerate` | Regenerate AI summary and refresh semantic embedding |
| `POST` | `/api/bookmarks/:id/tags/suggest` | Generate fresh structured tag suggestions |
| `PATCH` | `/api/bookmarks/:id/tags/suggestions` | Accept, edit-and-accept, or reject suggested tags |
| `POST` | `/api/bookmarks/:id/folder/recommend` | Generate an intelligent folder recommendation |
| `PATCH` | `/api/bookmarks/:id/folder/recommendation` | Accept or reject the recommended folder |

---

## ☁️ Deployment (Vercel + Render + MongoDB Atlas)

1. **MongoDB Atlas**: Create an Atlas Vector Search index named `bookmark_vector_index` on the `bookmarks` collection (`numDimensions: 384`, `similarity: "cosine"`, `filter` on `user`).
2. **Render — Python Embedding Service**: Deploy `embedding-service/` (via `Dockerfile` or Python 3) with `PORT=8000`, `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2`, and `EMBEDDING_DIMENSIONS=384`.
3. **Render — Express Backend**: Deploy `server/` with `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `EMBEDDING_SERVICE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`, and `AI_COMBINED_PROMPT=true`.
4. **Vercel — React Frontend**: Deploy `client/` with `VITE_API_URL` pointing to your Render backend `/api` URL.

---

## ⚠️ Architectural Notes

- **Static HTML Extraction**: For security and low latency, NestLink parses static HTML without executing JavaScript; client-heavy SPAs or bot-protected pages degrade gracefully to user-provided title/description or a clear fallback state.
- **Zero-Infrastructure Background Queue**: The async processing queue, rate-limit buckets, and metadata LRU cache run in-process for single-service Render compatibility; interrupted jobs can be retried anytime via the UI or `POST /api/bookmarks/:id/process`.
