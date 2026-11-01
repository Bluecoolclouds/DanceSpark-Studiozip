---
name: Web modal focus
description: React Native Web modal focus containment and dismissible backdrops.
---

Use a non-focusable View with responder callbacks for a clickable modal backdrop,
not a Pressable with `tabIndex={-1}`.

**Why:** In this project's React Native Web runtime, the modal focus manager could
programmatically focus the backdrop Pressable despite its negative tab index,
leaving the visible sheet when cycling with Tab.

**How to apply:** Preserve the keyboard-accessible close button inside the sheet.
Check both Tab directions and pointer dismissal when changing modal wrappers.
