---
name: Account transition isolation
description: Security boundary for in-flight work and cached data when switching accounts.
---

Account transitions must isolate both cached data and work still in progress;
clearing a shared cache on sign-out alone is not a sufficient security boundary.

**Why:** An old request or mutation callback can finish after the identity has
changed. Its result must never become visible to the next account, especially
when the old account was an administrator.

**How to apply:** When changing session handling, consider owner → regular user,
regular user → signed out, and returning to the original account. Check late
responses, local form state, and account-scoped persistent data as well as
immediate cache contents.

When migrating authentication providers, preserve Danceflow's existing internal account IDs and map provider identities to them, rather than replacing account IDs with the new provider's subjects. Do not link accounts solely by matching email addresses.

**Why:** The user approved a staged Clerk-to-Logto migration that preserves accounts, roles, generation history, and device-local drafts. Provider identity changes must not change ownership or bypass proof of account control.

**How to apply:** Resolve authenticated provider identities to a stable internal account before loading account-scoped data. Keep the existing login working until the replacement and account linkage have been verified.

Текущее решение пользователя: «пока на клерке будем … так быстрее». Переход на Logto приостановлен; используем Clerk.

**Why:** Пользователь решил пока остаться на Clerk, чтобы быстрее подготовить запуск.

**How to apply:** Не считать переход на Logto условием готовности к production и не включать его в рамках подготовки запуска. Если пользователь возобновит переход, ранее согласованный объём — сначала веб и админка, не Android/iOS. Заполненная переменная native-app со значением SPA не подтверждает настройку нативного OAuth.

Credential retrieval is part of in-flight work: a pending request must not borrow the next session's token, and a pending account-link action must not use a newly selected legacy account.

**Why:** A mutable SDK getter can change identities while an earlier operation is awaiting another promise, even when query caches are already isolated.

**How to apply:** Bind asynchronous credentials and mutation proofs to the initiating identity, recheck after awaits, and discard stale work before sending a mutation.
