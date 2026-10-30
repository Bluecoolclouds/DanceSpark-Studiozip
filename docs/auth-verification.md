# Authentication verification after import

Checked on 2026-10-30. The existing external Clerk instance was preserved.
No provisioning, key changes, owner changes, or paid generations were performed.
No real credentials were read or included here.

## Verified

- `pnpm run typecheck` passes across the workspace.
- `pnpm --filter @workspace/api-server test` passes all 56 tests in a disposable
  PostgreSQL instance with synthetic credentials and external networking disabled.
- API, admin, and Expo managed workflows start successfully.
- On the running development preview, `/api/healthz` returns 200.
  `/api/admin/session`, `/api/admin/overview`, and `/api/account/subscription`
  return 401 without a session.
- `/admin/sign-in` renders the actual Clerk email and Google sign-in form.
  A separate development-banner script has a 404/MIME warning; it does not
  prevent the sign-in form from rendering.
- Owner-email configuration is present. This is a presence check, not proof
  that a particular live identity has owner access.

## Regression coverage

`artifacts/api-server/tests/auth-account.test.ts` exercises real middleware and
route chains with synthetic **post-verification Clerk output**:

- Anonymous requests and client-supplied identities cannot select an account.
- Only a verified configured owner email grants the initial admin role, once.
- Verifying an existing owner allows bootstrap, including when the configured
  email has surrounding whitespace.
- Blocked owners cannot access their account.
- Switching owner → regular user → signed out → owner preserves account data.
- Admin routes return 200 for admins, 403 for regular users, and 401 for guests.
- Regular users cannot mutate admin settings or users.
- Subscription responses follow the authenticated account, ignoring submitted
  account and plan selectors.
- A failed Clerk identity lookup provisions no account and grants no access.

Existing tests separately exercise anonymous and forged-token rejection through
the real Clerk middleware and rejection of another account's generation result.
These tests do **not** prove that a real external Clerk user can sign in.

## Changes

- Admin queries use separate caches and remount account-local UI on identity
  changes. Late responses and mutation callbacks cannot populate the next
  account's cache through the discarded client.
- Owner-email normalization is consistent between initial bootstrap and the
  check that retries verification for an existing account.
- Mobile account-scoped query clients and draft/favorite namespaces were
  inspected; mobile authentication and storage behavior were not changed.

## Unverified browser flows

The browser verification run failed before returning evidence; attempting to
resume the same run also failed because the connection was lost.
No successful authenticated browser run is claimed.

An authenticated browser pass against the existing external Clerk instance is
still needed for:

1. Mobile email sign-in and sign-out using actual Clerk sessions.
2. Mobile A → B → A switching: drafts/favorites disappear and return only for
   their owner, including after reload.
3. Actual owner login to the admin panel and successful admin-session response.
4. Ordinary-user login, denied admin screen, and “Выйти и сменить аккаунт”
   returning to sign-in without showing the previous admin's data.

Use supported test authentication or an authorized existing test session.
Do not reprovision Clerk, request passwords in chat, grant roles to arbitrary
users, or weaken server authentication to finish these checks.
