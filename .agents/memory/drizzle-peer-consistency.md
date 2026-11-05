---
name: Drizzle peer consistency
description: Optional peers can produce incompatible nominal Drizzle types across workspace packages.
---

Keep Drizzle's optional peer resolution aligned across database and server packages.

**Why:** Introducing Better Auth added Kysely to the server's Drizzle peer environment but not the database library's. The same Drizzle version then resolved to two distinct package instances, making SQL and column types incompatible throughout unrelated catalogue and generation code.

**How to apply:** When same-version Drizzle types report separate private/protected declarations, inspect the pnpm peer-qualified paths and align optional peer dependencies before changing queries or adding casts.
