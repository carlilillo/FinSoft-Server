# FinSift — server

NestJS API that connects to a user's Gmail, runs a LangChain **deep agent** in the background to find and
extract invoices (English and Spanish), and serves invoices, products, price history and spend insights.

## Stack

NestJS 12 (ESM) · TypeORM + PostgreSQL · pg-boss (jobs on the same Postgres) · LangChain `deepagents` + OpenAI ·
LangGraph Postgres checkpointer & store · S3 (server-side writes, presigned downloads) · Clerk (networkless JWT verification) · Vitest.

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm start:dev         # runs migrations on boot (DATABASE_MIGRATE_ON_BOOT), creates the langgraph + pgboss schemas
```

| Script | What it does |
|---|---|
| `pnpm check` | typecheck + lint (oxlint, incl. domain-purity rule) + unit tests |
| `pnpm test:e2e` | HTTP-level tests (auth guard) |
| `pnpm build && pnpm agent:smoke` | Real end-to-end agent run on 4 fixture emails (ES PDF factura, EN image receipt, newsletter, shipping notice) against your Postgres, S3 and OpenAI; cleans up after itself |
| `pnpm build && pnpm migration:run` | Apply pending migrations and exit (non-zero on failure) |
| `pnpm build && pnpm migration:show` | List migrations and whether each one is applied |
| `pnpm build && pnpm migration:revert` | Revert the last applied migration |

### Database migrations in the cloud

Run migrations as a **release / pre-deploy step**, before new app instances start, and keep app servers out of it:

1. Build the image as usual (`pnpm build`; the migrations are compiled into `dist/`).
2. Release step: `node dist/database/migrate.js` with `POSTGRESQL_URL` in the environment (no `.env` needed).
   It applies every pending migration in **one transaction** and exits 0, or rolls back and exits 1, which should
   stop the deploy.
3. Set `DATABASE_MIGRATE_ON_BOOT=false` on the app instances.

Both paths (the release step and boot-time migrations) take the same Postgres advisory lock, so concurrent deploys
or replicas booting at the same time wait for each other instead of running a migration twice. Migrations must
stay backwards compatible with the version still serving traffic while the new one rolls out (add first,
remove in a later release).

### External setup

- **Clerk**: copy the *JWT public key* (PEM) into `CLERK_JWT_KEY`; list your client origins in `CLERK_AUTHORIZED_PARTIES`.
- **Google Cloud**: OAuth client of type *Web application*, authorized redirect URI = `GOOGLE_REDIRECT_URI`
  (`http://localhost:3000/gmail/oauth/callback` in dev). Enable the Gmail API. `gmail.readonly` is a restricted
  scope: keep the app in *Testing* and add your account as a test user until Google verifies it.
- **S3**: a private bucket (the browser never writes to it; downloads use presigned GET URLs).

## Architecture

```
src/
├── common/        Clerk guard (@Public, @CurrentUser), DomainError + filter, AES-GCM token cipher, ULID pipe
├── config/        zod-validated env
├── database/      TypeORM options, ULID ids, migrations
├── users/         ensure-user interceptor, GET/DELETE /me (full account removal)
├── gmail/         OAuth consent URL, connected accounts (several per user), last-week raw (.eml) fetch with backoff
├── analysis/      runs (Gmail or imported PDFs), background processor, consent callback → run page
├── agent/         deep agent, subagent, tools, prompts (EN/ES), Postgres persistence, run logger
├── emails/ imports/ invoices/ products/ documents/ insights/   feature modules
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
        read_file → save_invoice → save_invoice_products → store_invoice_document

document-extractor (imported PDFs: one thread per document, no triage, no subagent)
  └─ read_file /uploads/{name}.pdf → save_invoice → save_invoice_products
```

- **Imports.** `POST /analyses/imports` (multipart `files`, 1–10 PDFs, 20 MB each, checked by declared type
  *and* `%PDF-` signature) creates an extraction session with `source = 'upload'`. Each PDF is written to
  `/uploads/` in the workspace of its own thread (thread id = `import_files.id`) and the pg-boss job runs one
  **batch** of the document extractor, one element per PDF (5 at a time; one failing never stops the others).
  The server then attaches the original PDF to every invoice read from it (`invoice_documents.source = 'import'`)
  and records each file's outcome (`extracted`, `not_invoice`, `failed`) from the stored invoices and the
  extractor's final `NOT_AN_INVOICE:` / `FAILED:` line. Import sessions cannot be re-run with a selection.
- **At most 3 analyses in progress per user** (`MAX_ACTIVE_RUNS`, Gmail and imports together). Run creation
  takes a per-user Postgres advisory lock so concurrent requests can't exceed it (`RUN_LIMIT_REACHED`, 409),
  and the worker handles `ANALYSIS_WORKER_CONCURRENCY` (default 3) jobs at the same time.
- **One Gmail extraction at a time per user** (business rule, not configurable): starting or re-running a Gmail
  analysis while another one is in progress fails with `GMAIL_RUN_ALREADY_ACTIVE` (409). Imports are unaffected.
- **Several Gmail accounts per user.** Each linked account is a `gmail_connections` row (unique per user and
  address) holding its own encrypted refresh token. A Gmail analysis reads the inbox of every connected account
  into one session; `emails.gmail_connection_id` and `invoices.gmail_connection_id` record the account each one
  came from (null for imported invoices). Disconnecting revokes and wipes the token but keeps the row, so that
  origin stays visible. If one account can no longer be read the run fails naming it (`GMAIL_ACCESS_REVOKED`).

- **Files, not prompts.** Ingestion writes each email body and its original attachments into the agent's
  filesystem under `/inbox/`, which `CompositeBackend` routes to a `StoreBackend` on **PostgresStore**,
  namespaced per user *and* thread (no cross-thread memory). The invocation message only lists paths.
- **Plain PDFs.** Attachments are stored as-is and the subagent opens them with `read_file`: PDFs and images
  come back as file/image content blocks, XML and HTML as text. `NativeFileResultsMiddleware` hands PDF tool
  results to OpenAI as native `input_file` items (LangChain only does that for images), so use a model that
  reads PDFs. The model can read `/inbox/` but never write to it. `BinarySafeStore` base64-wraps binary files
  so they survive Postgres `jsonb`.
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
| POST | `/gmail/oauth/url` | `{ intent: 'analyze' \| 'connect' }` → Google consent URL (account picker, so more accounts can be linked) |
| GET | `/gmail/oauth/callback` | public; stores the account's grant. `analyze`: starts a run, 302 → `CLIENT_URL/analyses/:id`. `connect`: 302 → `CLIENT_URL/settings` |
| GET | `/gmail/connections` | the user's connected Gmail accounts |
| DELETE | `/gmail/connections/:id` | disconnect one account (its emails and invoices keep their origin) |
| POST / GET | `/analyses` | start (202) / history |
| POST | `/analyses/imports` | multipart `files` (1–10 PDFs): new extraction session from imported invoices (202) |
| GET | `/analyses/:id` | status, progress and, when finished, the session (totals, invoices, products, evaluated emails) |
| POST | `/analyses/:id/continue` | `{ emailIds, note? }` re-run the same thread with the real invoice emails (202) |
| GET | `/invoices`, `/invoices/:id` | list (search, vendor, run, date range) / detail with lines and documents |
| GET | `/products`, `/products/:id` | catalog / detail with price history |
| GET | `/documents/:id/download-url` | presigned GET (5 min) |
| GET | `/insights/spend?range=7d\|14d\|30d`, `/insights/summary` | dashboard |
