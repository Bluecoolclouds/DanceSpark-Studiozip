---
name: Provider model discovery
description: How to verify newly released Higgsfield models without substituting a different model.
---

Use the selected model's own official `llms.txt` documentation to establish its
endpoint and schema; absence from Higgsfield's shared documentation index or
supplementary OpenAPI catalogue does not establish unavailability.

**Why:** Newly released Light models were discoverable on official model pages
with model-specific agent-documentation links, while general searches prominently
returned the different, non-Light Genjutsu models.

**How to apply:** Follow the official discovery/source-priority guidance and the
selected model page's agent-documentation link. Distinguish published production
contracts from entitlement verified with an account. Never test a paid endpoint
just to discover its schema or silently substitute a similarly named model.
