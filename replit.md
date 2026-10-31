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
- Catalogue clips and posters live in App Storage under the public `dance-templates` prefix. The API serves only allowlisted catalogue assets, with byte ranges for video playback. App Storage settings must be available to the API in the target environment.
- Imported workspace setup: the existing App Storage settings currently return HTTP 401 for catalogue assets, surfaced as HTTP 503 by the media API. The ZIP does not contain those clips/posters. Restore the `dance-templates` files into this project's own App Storage before expecting catalogue previews or source-video generation to work; do not bypass storage authorization or replace the clips with mock results.
- Original MP4 files are used as draft inputs; WebM versions are for browser previews only. The API's local media cache is disposable, not durable storage.
