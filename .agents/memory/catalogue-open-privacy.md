---
name: Catalogue open privacy
description: Privacy constraints and tradeoffs for ranking protection on anonymous catalogue opens.
---

Catalogue ranking protection must not persist network addresses, account identifiers, or other personal identifiers. Use a short-lived keyed digest in process memory to limit how many distinct anonymous tokens from one network source can affect a card. Reopens with the same token must remain valid.

**Why:** Visitors are intentionally anonymous, and network-based limits can group legitimate people who share Wi-Fi. Keep the limit specific to one card and the existing trending window; do not turn this into user tracking.

**How to apply:** Any future attempt to make this protection shared across API instances must preserve the no-persistent-address constraint and account for shared-network visitors.
