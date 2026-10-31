---
name: Imported runtime and storage constraints
description: Imported modules can override the Node runtime, and source-project media storage does not transfer.
---

Remove an imported Vue Node.js 20 module when selecting Node.js 24 for Expo, not just the standalone Node.js 20 module.

**Why:** Installing Node.js 24 initially made it visible, but subsequent shells and workflows still selected Node.js 20 until the overlapping Vue module was removed.

**How to apply:** Check the effective runtime after module changes and restart the managed services after completing the environment changes.

Treat imported App Storage settings as references, not proof that this project can access the source project's media.

**Why:** Catalogue assets returned authorization errors despite all three storage secrets being present and setup reporting already configured. The imported ZIP contained no catalogue clips or posters. Official documentation states buckets do not transfer between projects.

**How to apply:** Preserve originals and ask the user to supply exported media for restoration into this project's storage. Never bypass authorization or claim media playback was verified from a successful app startup alone.
