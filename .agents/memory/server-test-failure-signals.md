---
name: Server test failure signals
description: Non-obvious Node test-runner behavior relevant to fail-closed network safety checks.
---

Network-safety probes must assert a nonzero child-process exit code, not just a printed assertion failure. Remove inherited test-runner context when probing a standalone child.

**Why:** During isolation work, Node printed a failing root `after` hook in an eval-mode probe but still exited successfully. A swallowed outbound-network error could therefore look like a successful safety check without an explicit failure exit status.

**How to apply:** When extending test bootstrap guards or writing subprocess-based safety tests, check both the diagnostic and the exit status. Keep probes offline and use synthetic configuration only.
