---
name: Expo preview loading
description: Interpreting blank browser captures of asynchronously bundled Expo routes.
---

Do not infer that a page requires sign-in solely because an Expo preview capture is blank.

**Why:** Create and Studio rendered for a signed-out visitor after their async route bundles loaded; initial captures during cold compilation were blank without a browser exception.

**How to apply:** Distinguish unfinished route loading from authentication or a runtime failure using bundle/network activity and workflow logs before reporting that a screen cannot be checked without signing in.
