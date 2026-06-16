# AGENTS.md

General architecture and code guidance lives in `CLAUDE.md` (and per-app `CLAUDE.md` files, e.g. `apps/restate-worker/CLAUDE.md`). Read those first. This file only adds Cursor Cloud specific operating notes.

## Cursor Cloud specific instructions

### Scope / what runs locally

The primary product is the **`web`** app (TanStack Start on a Cloudflare Worker, run via Vite). It plus a **local Cloudflare D1** (SQLite, provided automatically by the `@cloudflare/vite-plugin` / miniflare runtime — no Cloudflare account needed) is everything required to sign up, create an organization, and create a project. The other apps are optional for the core flow:

- `apps/restate-worker` — durable scan/discovery engine (needs a Restate server + scanner binaries like `nmap`). Only needed to actually run scans.
- `apps/data-service` — notification email delivery (Cloudflare Queue consumer + Resend). Optional.
- `apps/screenshot-worker` — deprecated; needs a Cloudflare paid plan.

### Node version

Node 22 is required (`.nvmrc` = 22). The VM already has Node 22 active.

### Dependency build order (important gotcha)

`@repo/contracts` and `@repo/data-ops` resolve to their compiled `dist/` (see their `package.json` `exports`), so they MUST be built before typechecking/running anything that imports them. `contracts` must be built **before** `data-ops` (data-ops imports `@repo/contracts/*` subpaths). The startup update script already runs `pnpm install` + builds both. After editing `packages/contracts` or `packages/data-ops`, rebuild them (`pnpm --filter @repo/contracts build` then `pnpm run build:data-ops`). The other workspace packages (`logger`, `constants`, `validation`, `config`) resolve to source `.ts` and need no build.

### First-run setup not covered by the update script

These are runtime/dev setup steps (not dependency installs), so they are NOT in the update script. Run them once if missing:

1. **`apps/web/.dev.vars`** (gitignored) — local env for the web worker. Minimum:
   ```
   BETTER_AUTH_SECRET="local-dev-secret-do-not-use-in-prod-0123456789abcdef"
   APP_URL="http://localhost:13000"
   BETTER_AUTH_URL="http://localhost:13000"
   NODE_ENV="development"
   WORKER_API_KEY="local-dev-worker-api-key"
   ```
   Without local overrides, `apps/web/wrangler.jsonc` `vars` point at production URLs (`https://sec.rocks`). `http://localhost:13000` is already in better-auth `trustedOrigins`.
2. **Apply local D1 migrations** (creates auth/org/project tables in `apps/web/.wrangler/state`):
   ```
   cd apps/web && pnpm wrangler d1 migrations apply sec-db --local
   ```
   Note: `packages/data-ops` has `drizzle:migrate` scripts that point at the old `apps/user-application/wrangler.jsonc` path (stale — the app is now `apps/web`); use the command above instead. `drizzle-kit push` uses the remote `d1-http` driver and needs real Cloudflare credentials — not for local dev.
3. **Generate Cloudflare worker types** for typecheck (`worker-configuration.d.ts`, gitignored/generated): `cd apps/web && pnpm run cf-typegen`.

### Running the web app

From repo root: `pnpm run dev:web` → http://localhost:13000 (Vite prints `Using vars defined in .dev.vars`). Health check: `GET /api/health`.

### Auth note (non-obvious)

The sign-up/login UI only exposes Google/GitHub OAuth, but better-auth **email/password is enabled at the API level** (`/api/auth/sign-up/email`, `/api/auth/sign-in/email`). With no OAuth credentials configured, create a local account via that API (e.g. `curl -c cookies.txt -X POST http://localhost:13000/api/auth/sign-up/email -H 'Content-Type: application/json' -d '{"email":"demo@example.com","password":"DemoPass123!","name":"Demo"}'`). Org/project creation goes through tRPC (`/trpc/onboarding.createOrganization`, `/trpc/onboarding.createProject`); the transformer is superjson, so request bodies are wrapped as `{"json": {...}}`.

### Lint / test / typecheck caveats

- "Lint" in this repo is `tsc --noEmit` (`pnpm --filter <pkg> typecheck`); there is no ESLint config and no git hooks.
- `pnpm --filter web typecheck` currently reports **pre-existing** errors unrelated to environment setup: the `web` app has no `vitest`/`drizzle-orm` dev deps so its `*.test.ts` files fail to typecheck, plus a null-check error in `src/trpc/utils/project-access.ts`. These exist on a clean checkout.
- Tests use Vitest (`pnpm -r test` or per package `pnpm --filter <pkg> test:run`). `packages/data-ops` has one pre-existing failing test (`notification-module.test.ts`); the rest pass. `apps/restate-worker` tests use testcontainers and need Docker.
