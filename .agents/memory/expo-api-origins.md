---
name: Expo API origins
description: Environment-specific transport routing for Expo web and native apps.
---

Expo web runs under its own Replit artifact domain, separate from the API's development domain. Relative `/api` requests are routed by the Replit artifact proxy and avoid cross-origin auth/config failures. Installed native builds do not run through this browser proxy and need the explicit HTTPS API origin.

**Why:** Replit exposes separate Expo preview and API hosts; using the API development host from a browser preview can fail even when the same API URL works in command-line checks.

**How to apply:** In the Expo app entry point, clear the shared API base URL for web and use same-origin `/api` requests. Set the configured HTTPS API base only for native platforms. Verify both the actual browser's network request and native production configuration before changing this split.
