# FinSift — server

NestJS API that connects to a user's Gmail, runs a LangChain **deep agent** in the background to find and
extract invoices (English and Spanish), and serves invoices, products, price history and spend insights.

## Stack

NestJS 12 (ESM) · TypeORM + PostgreSQL · pg-boss (jobs on the same Postgres) · LangChain `deepagents` + OpenAI ·
LangGraph Postgres checkpointer & store · S3 (presigned upload/download) · Clerk (networkless JWT verification) · Vitest.

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm start:dev         # runs migrations on boot, creates the langgraph + pgboss schemas
```

| Script | What it does |
|---|---|
| `pnpm check` | typecheck + lint (oxlint, incl. domain-purity rule) + unit tests |
| `pnpm test:e2e` | HTTP-level tests (auth guard) |
| `pnpm build && pnpm agent:smoke` | Real end-to-end agent run on 4 fixture emails (ES PDF factura, EN image receipt, newsletter, shipping notice) against your Postgres, S3 and OpenAI; cleans up after itself |
| `pnpm build && pnpm migration:run` | Run migrations manually |

### External setup

- **Clerk**: copy the *JWT public key* (PEM) into `CLERK_JWT_KEY`; list your client origins in `CLERK_AUTHORIZED_PARTIES`.
- **Google Cloud**: OAuth client of type *Web application*, authorized redirect URI = `GOOGLE_REDIRECT_URI`
  (`http://localhost:3000/gmail/oauth/callback` in dev). Enable the Gmail API. `gmail.readonly` is a restricted
  scope: keep the app in *Testing* and add your account as a test user until Google verifies it.
- **S3**: a private bucket. For browser uploads add a CORS rule allowing `PUT` from the client origin.

## Architecture

```
src/
├── common/        Clerk guard (@Public, @CurrentUser), DomainError + filter, AES-GCM token cipher, ULID pipe
├── config/        zod-validated env
├── database/      TypeORM options, ULID ids, migrations
├── users/         ensure-user interceptor, GET/DELETE /me (full account removal)
├── gmail/         OAuth consent URL, connection status, last-week raw (.eml) fetch with backoff
├── analysis/      runs (= LangGraph thread ids), background processor, consent callback → run page
├── agent/         deep agent, subagent, tools, prompts (EN/ES), Postgres persistence, run logger
├── emails/ invoices/ products/ documents/ insights/   feature modules
└── jobs/          pg-boss queue
```

Every feature follows *controller → service → domain + repository*. `domain/` folders are pure TypeScript
(enforced by oxlint) and hold all business rules: cents conversion, invoice/line validation, vendor and
product identity, run lifecycle, continuation planning, spend bucketing.

### Money

All amounts are stored as integer **cents** (`bigint`). The agent reports decimal strings (`"1234.56"`);
`toCents` parses them as decimals (no float error) and multiplies by 100. The API returns `*Cents` fields.

### The agent

```
invoice-triage (main deep agent, todo middleware)
  ├─ reads /inbox/{emailId}/email.md (body text only) → record_triage
  └─ task → invoice-extractor (subagent, todo middleware)
        convert_attachment → read_file → save_invoice → save_invoice_products → store_invoice_document
```

- **Files, not prompts.** Ingestion writes each email body and its original attachments into the agent's
  filesystem under `/inbox/`, which `CompositeBackend` routes to a `StoreBackend` on **PostgresStore**,
  namespaced per user *and* thread (no cross-thread memory). The invocation message only lists paths.
  Tools that produce content (`convert_attachment`) write files and return paths.
- PDFs/XML/HTML are converted to text files (scanned PDFs to page images) because OpenAI can't take PDFs
  inside tool results; the model is blocked from opening them directly by filesystem permissions.
  `BinarySafeStore` base64-wraps binary files so they survive Postgres `jsonb`.
- **Checkpointer:** `PostgresSaver` (schema `langgraph`). The thread id is the analysis run id, which tools read
  from the runtime and stamp on every invoice (`invoices.run_id`). Re-running with the user's corrected email
  selection invokes the same thread, so the agent keeps its context.
- **Background:** `POST /analyses` (or the Gmail consent callback) creates a run and enqueues a pg-boss job; the
  client polls `GET /analyses/:id`. Reasoning summaries, todos, tool calls and subagent delegations are written
  as structured log lines (`context: "AgentRun"`), never sent to the client.

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | public |
| GET / DELETE | `/me` | profile / delete account (DB, agent threads, S3, Clerk) |
| POST | `/gmail/oauth/url` | Google consent URL |
| GET | `/gmail/oauth/callback` | public; stores the grant, starts a run, 302 → `CLIENT_URL/analyses/:id` |
| GET / DELETE | `/gmail/connection` | status / disconnect |
| POST / GET | `/analyses` | start (202) / history |
| GET | `/analyses/:id` | status, progress and, when finished, the session (totals, invoices, products, evaluated emails) |
| POST | `/analyses/:id/continue` | `{ emailIds, note? }` re-run the same thread with the real invoice emails (202) |
| GET | `/invoices`, `/invoices/:id` | list (search, vendor, run, date range) / detail with lines and documents |
| GET | `/products`, `/products/:id` | catalog / detail with price history |
| POST | `/documents/upload-url`, `/documents/:id/confirm` | presigned PUT upload |
| GET | `/documents/:id/download-url` | presigned GET (5 min) |
| GET | `/insights/spend?range=7d\|14d\|30d`, `/insights/summary` | dashboard |
