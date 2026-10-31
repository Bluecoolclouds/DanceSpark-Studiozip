---
name: Browser auth runtime caveats
description: Logto React SDK error propagation during staged authentication.
---

Do not assume Logto React SDK method failures reject their returned promises.

**Why:** The installed `@logto/react` 4.1.3 implementation catches failures in methods such as sign-in, sign-out and token retrieval, saves a context error, and may return undefined. Relying only on a caller's catch can leave a busy screen forever. The stored error can also prevent callback handling from running.

**How to apply:** Verify the installed SDK implementation after upgrades. Treat its context error as a failed authentication state, never expose account data or send an anonymous request when authenticated token retrieval fails, and reset the provider for recovery when its error is persistent. Handle callback URLs with missing state and bound their loading time.

