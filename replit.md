# Danceflow

An Expo dance-video app with a separate web admin panel and Express API.

## Run & Operate

- Install dependencies with `pnpm install --frozen-lockfile`.
- Use the `nodejs-24` Replit module. Remove the imported `vue-node-20` module as well as `nodejs-20`; otherwise the Vue module can keep Node.js 20 on PATH, below Expo's required Node.js 22.13 minimum.
- Start services through their managed Replit workflows, which supply `PORT` and routing:
  - `artifacts/danceflow: expo` — mobile app and Expo web preview.
  - `artifacts/danceflow-admin: web` — admin panel at `/admin/`.
  - `artifacts/api-server: API Server` — API at `/api`.
  - `artifacts/mockup-sandbox: Component Preview Server` — existing design previews at `/__mockup`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required settings: `DATABASE_URL` (Replit-managed PostgreSQL), `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. The admin panel also uses `VITE_CLERK_PUBLISHABLE_KEY`. Clerk currently reports an externally configured instance; preserve this configuration rather than reprovisioning it.
- After provisioning an empty development database, apply the existing schema with `pnpm --filter @workspace/db run push`. Review proposed changes before applying to a database containing data.
- `higgs_api` is required only for actual Higgsfield generation; keep it in Secrets. Do not enable paid generation without provider configuration and spending limits.
- `DANCEFLOW_OWNER_EMAIL` identifies the intended administrator; ownership also requires a verified authenticated identity.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Imported project names ending in `.zip` can be rejected by Clerk provisioning as URL-like names. A plain project name is needed, but renaming and refreshing did not resolve the observed provisioning error in this import; see the agent memory note on imported authentication provisioning before retrying.
- Without Clerk provisioning, the mobile app cannot initialize authentication and API middleware can return errors even for health requests. Do not bypass authentication to make previews load.
- Run backend tests with `pnpm --filter @workspace/api-server test`. The launcher requires PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`) on PATH, starts a disposable Unix-socket-only cluster, applies the current Drizzle schema, and removes it afterwards. It does not use `DATABASE_URL` or credentials from the application environment. Synthetic Clerk/Higgsfield keys and a network guard prevent external requests; production configuration checks remain unchanged. To run selected files, pass e.g. `pnpm --filter @workspace/api-server test tests/admin-governance.test.ts`. Direct test invocation fails unless launched in this isolated environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- YooKassa preparation and launch checklist: [docs/payments/yookassa-readiness.md](docs/payments/yookassa-readiness.md). This is a specification, not an active payment integration.
- Catalogue clips and posters use a private Cloudflare R2 bucket and fixed `dance-templates` prefix. Setup, secret names, allowlist, protected PUT contract, limits, cache policy, smoke test and restoration: [docs/storage/cloudflare-r2.md](docs/storage/cloudflare-r2.md). The Cloudflare connection is for account administration; the API uses separate bucket-scoped S3 keys in Secrets.
- R2 uses Replit Secrets `CLOUDFLARE_R2_ACCESS_KEY_ID` and `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, with account and bucket settings in the shared environment. Scope the R2 token to Object Read & Write on `danceflow-media` only.
- An administrator can create or replace allowlisted files with `PUT /api/admin/dance-templates/{trend-id}/{asset}` using raw bytes and matching MIME type. Uploads are capped at 100 MiB for video and 10 MiB for JPEG, with content signature checks and an audit entry; arbitrary bucket paths are not exposed.
- Imported workspace setup: the ZIP does not contain catalogue clips/posters and imported App Storage access was unavailable. Restore provided originals into R2 before expecting catalogue playback or source-video generation to work; never bypass storage authorization or substitute mock results.
- Original MP4 files are used as draft inputs; WebM versions are for browser previews only. Catalogue responses revalidate with R2 ETags; there is no server disk cache to hide replacements.
