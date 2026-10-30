# Danceflow server controls

The admin console uses persisted PostgreSQL records, not sample statistics. The existing generator must be connected to the gateway before these controls affect its provider requests. The admin API intentionally reports `telemetryConnected: false` until that integration is implemented and verified.

The owner has selected two Genjutsu **Light** endpoints, priced per input-plus-output second, not per job. See `GENJUTSU_LIGHT.md` for the exact selection and required duration-aware budget calculation before enabling paid submissions. The configured generic per-job estimate must not be represented as the actual provider charge.

## Required generator integration

1. Authenticate with Clerk, resolve the local account using `requireAccount`, take the identity from `res.locals.account`, never from a request-body user ID.
2. Validate the photo and template before reserving a paid operation.
3. Call `reserveGeneration({userId, idempotencyKey, templateId})` before making any provider request. Map `GenerationPolicyError.status` and `.code` to a suitable response.
4. If `reused` is true, return the existing job: **do not submit again**. The request key is unique per user. Changing templates with the same key returns a conflict.
5. Call `beginGeneration(id)`. Only the caller receiving `true` may submit to Higgsfield. A pause between reservation and submission prevents the call. Integrate queued recovery/cancellation with the actual provider worker; these helpers do not implement a worker.
6. Record completion via `finishGeneration(id,"succeeded")` or `finishGeneration(id,"failed","provider_error"|"timeout"|"cancelled")`. Do not store raw upstream responses, signed URLs, keys or photo data in the admin ledger.
7. Correlate the gateway ID to the actual provider job in the generator's durable storage. Never retry an ambiguous upstream submission automatically: reconcile provider state first.
8. Only after every paid submission passes through this boundary, change `telemetryConnected` to true in both settings and overview and verify the provider flow.

## Commercial and accounting rules

- Monthly plans: warmup 500 RUB / 10 per day; dancefloor 1,500 RUB / 25 per day; stage 2,500 RUB / no daily count limit. Unlimited still has concurrent and spend safety limits.
- Payment verification must set plan and subscription expiry server-side. The admin's user controls cannot grant a subscription. No RevenueCat; YooKassa is not connected here.
- Daily quota resets at 00:00 UTC. Queued/running/successful jobs consume quota; failed jobs release the daily slot.
- Estimated spend includes failures conservatively, as upstream failures can still cost money. It is not the provider's invoice or balance. Unknown estimates remain unknown.
- Reservations serialize on the controls row, so per-user quota, total concurrency, per-user concurrency and daily estimated budget cannot race across server instances.
- Initially paused. Resuming requires a key, configured unit estimate and daily budget. Controls cannot guarantee actual billed costs if provider prices exceed the configured estimate.
- An owner-configured email (`DANCEFLOW_OWNER_EMAIL`) receives the first administrator role only after Clerk verifies that email. Provisioning is once per database; revocation is not silently undone. Development and production identities are resolved independently. Never expose this configuration in client bundles.
- Schema changes use Drizzle's managed development/publish workflow. There is no runtime DDL.

## Checks

`pnpm --filter @workspace/api-server exec tsx --test tests/admin-governance.test.ts`

The tests create and drop a uniquely named isolated PostgreSQL schema. They do not submit AI requests, create paid subscriptions for real users, or modify the application's rows.
