---
name: Imported authentication provisioning
description: Provisioning can continue using the imported ZIP name after the visible project is renamed.
---

Clerk provisioning repeatedly rejected the original ZIP-style project name as URL-like. The user confirmed renaming the Replit project to Danceflow and refreshing the workspace; the next provisioning attempt still reported the original name.

**Why:** Renaming the visible project and refreshing were already tried without resolving the failure. Repeating those instructions or bypassing authentication would not establish a working, secure app.

**How to apply:** Treat the source of the stale name as unresolved, not a confirmed caching mechanism. Retry provisioning only after a relevant platform change or new evidence. Do not replace managed auth with external Clerk or remove auth gates as a setup workaround.

After authentication secrets were added through the workspace, Clerk reported an externally configured instance; restarting the existing services allowed both public frontends to load and the API health check to pass. This does not establish that managed provisioning was repaired or that authentication and billable generation have been tested.
