# Danceflow

An Expo dance-video app with a separate web admin panel and Express API.

## Run & Operate

- Install dependencies with `pnpm install --frozen-lockfile`.
- Start services through their managed Replit workflows, which supply `PORT` and routing:
  - `artifacts/danceflow: expo` — mobile app and Expo web preview.
  - `artifacts/danceflow-admin: web` — admin panel at `/admin/`.
  - `artifacts/api-server: API Server` — API at `/api`.
  - `artifacts/mockup-sandbox: Component Preview Server` — existing design previews at `/__mockup`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required settings: `DATABASE_URL` (Replit-managed PostgreSQL), `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` (provision through Replit-managed Clerk).
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
- Backend tests include database-writing governance tests and expect authentication/provider configuration. Run them only against a disposable development database, never production.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- YooKassa preparation and launch checklist: [docs/payments/yookassa-readiness.md](docs/payments/yookassa-readiness.md). This is a specification, not an active payment integration.
