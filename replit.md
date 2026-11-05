# Danceflow

An Expo dance-video app with a separate web admin panel and Express API.

## Run & Operate

- Import verification (2026-11-05): dependencies installed from the frozen lockfile, existing schema applied to an empty development database, and the three application workflows started successfully on Node.js 24. Full workspace typecheck, `/api/healthz`, and `/api/catalogue` passed; the mobile web landing page and admin landing page were visually checked. Authenticated screens, native-device operation, and paid generation were not verified. The optional mockup workflow remains stopped.
- Install dependencies with `pnpm install --frozen-lockfile`.
- On a fresh import, the development database starts empty: apply the existing schema with `pnpm --filter @workspace/db run push` before using the API. This does not restore the source project's users or data.
- Authentication uses self-hosted Better Auth in the existing Express API and PostgreSQL. Apply the additive auth schema on fresh imports. Clerk/Logto services and keys are no longer runtime requirements; retained old secrets must not be printed or removed automatically.
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
- Required settings: `DATABASE_URL` and a stable signing secret of at least 32 characters: `BETTER_AUTH_SECRET`, or the existing `SESSION_SECRET`. Keep it in Secrets; changing it invalidates signed cookies. Exact HTTPS origins come from runtime domains and optional `DANCEFLOW_WEB_ORIGINS`. Native release builds require `EXPO_PUBLIC_API_ORIGIN`; web uses same-origin `/api`. Never expose the signing secret in frontend variables.
- After provisioning an empty development database, apply the existing schema with `pnpm --filter @workspace/db run push`. Review proposed changes before applying to a database containing data.
- `higgs_api` is required only for actual Higgsfield generation; keep it in Secrets. Do not enable paid generation without provider configuration and spending limits.
- No SMTP yet: new email addresses are unverified; confirmation and email password reset are unavailable. No public email-based administrator bootstrap or account linking. See [Better Auth operations](docs/better-auth.md) for the trusted-terminal owner/migration procedures. Never grant ownership just because a signup uses `DANCEFLOW_OWNER_EMAIL`.

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

- Do not provision an external authentication service or bypass authorization to make previews load.
- Run backend tests with `pnpm --filter @workspace/api-server test`. The launcher requires PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`) on PATH, starts a disposable Unix-socket-only cluster, applies the current Drizzle schema, and removes it afterwards. It does not use the application database or credentials. Synthetic session/Higgsfield configuration and a network guard prevent external requests. To run selected files, pass e.g. `pnpm --filter @workspace/api-server test tests/better-auth.test.ts`. Direct test invocation fails unless launched in this isolated environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- YooKassa preparation and launch checklist: [docs/payments/yookassa-readiness.md](docs/payments/yookassa-readiness.md). This is a specification, not an active payment integration.
- Catalogue clips and posters use a private Cloudflare R2 bucket and fixed `dance-templates` prefix. Setup, secret names, allowlist, protected PUT contract, limits, cache policy, smoke test and restoration: [docs/storage/cloudflare-r2.md](docs/storage/cloudflare-r2.md). The Cloudflare connection is for account administration; the API uses separate bucket-scoped S3 keys in Secrets.
- R2 uses Replit Secrets `CLOUDFLARE_R2_ACCESS_KEY_ID` and `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, with account and bucket settings in the shared environment. Scope the R2 token to Object Read & Write on `danceflow-media` only.
- An administrator can create or replace allowlisted files with `PUT /api/admin/dance-templates/{trend-id}/{asset}` using raw bytes and matching MIME type. Uploads are capped at 100 MiB for video and 10 MiB for JPEG, with content signature checks and an audit entry; arbitrary bucket paths are not exposed.
- Imported workspace setup: the ZIP does not contain catalogue clips/posters and imported App Storage access was unavailable. Restore provided originals into R2 before expecting catalogue playback or source-video generation to work; never bypass storage authorization or substitute mock results.
- Original MP4 files are used as draft inputs; WebM versions are for browser previews only. Catalogue responses revalidate with R2 ETags; there is no server disk cache to hide replacements.
- Light Swapper server contract, supported controls, spending configuration, retry policy and verification: [docs/light-swapper-api.md](docs/light-swapper-api.md). Do not enable it without a conservative operator-approved USD/RUB conversion and accurate original durations.
- Current owner-approved launch scope is Swapper and Light Swapper only. PixVerse has no approved server price: new launches are explicitly unavailable in the UI and blocked by the API. Existing PixVerse job status and saved results remain readable; do not restore its launch UI without a verified tariff and product approval.
