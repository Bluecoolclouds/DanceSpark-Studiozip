---
name: Ambiguous generation submissions
description: Conservative accounting and retry policy when paid provider acceptance cannot be established.
---

Treat a missing provider acknowledgement as potentially billable, not as proof of rejection. Only failures known to precede the paid submission may release daily quota automatically. Keep ambiguous attempts in daily quota and estimated spend even after releasing concurrency.

**Why:** A provider can accept a paid request before a transport failure or API restart loses its acknowledgement. Releasing quota or retrying automatically could create duplicate charges or bypass spending protections.

**How to apply:** Preserve idempotency records permanently across recovery. Direct users to Higgsfield Console for manual verification; do not automatically resubmit. The deliberately conservative policy also treats error responses after the paid POST starts as ambiguous unless non-acceptance is independently established.
