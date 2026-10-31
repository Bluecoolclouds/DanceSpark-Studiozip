---
name: Storage video cancellation
description: Client-aborted media requests can expose a storage SDK pipeline failure.
---

With the imported Google Cloud Storage SDK, destroying a cloud read stream while its upstream response was still connecting produced an uncaught “Cannot pipe to a closed or destroyed stream” error and terminated the API process. This was an SDK-specific incident, not a requirement to keep the old storage provider or its disk cache.

**Why:** Browsers routinely cancel media and poster requests during navigation. Serving videos must survive these ordinary cancellations, not merely pass complete downloads.

**How to apply:** Verify cancellation behavior when changing storage SDKs, including both upstream connection and mid-body streaming. Use a lifecycle-safe stream pipeline or isolate upstream work from client cancellation; a temporary cache, if used, is not durable storage. Include aborted and concurrent media requests in verification.
