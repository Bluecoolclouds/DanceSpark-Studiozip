---
name: Storage video cancellation
description: Client-aborted media requests can expose a storage SDK pipeline failure.
---

With the storage SDK in this workspace, destroying a cloud read stream while its upstream response is still connecting produced an uncaught “Cannot pipe to a closed or destroyed stream” error and terminated the API process.

**Why:** Browsers routinely cancel media and poster requests during navigation. Serving videos must survive these ordinary cancellations, not merely pass complete downloads.

**How to apply:** Keep upstream storage downloads independent of client response cancellation, or verify that an SDK fix safely supports early aborts. A temporary read-through cache is disposable; App Storage remains the durable source. Include aborted and concurrent media requests in verification.
