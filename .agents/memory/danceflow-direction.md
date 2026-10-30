---
name: Danceflow product direction
description: User's product intent and design-first scope for the mobile dance app.
---

The user wants a phone app for generating dances, conceptually like Higgsfield's dance feature, beginning with design. They explicitly requested a bright Just Dance-inspired feel and generated images.

**Why:** The user asked to start with design rather than a functioning video-generation integration.

**How to apply:** Keep the original energetic dance identity and custom artwork in future screens. Treat actual video generation as a separate next step; never present a saved design draft as a generated video.

The user wants the dance cards nearly touching, with less rounding and no large vertical gaps between rows. Preserve the existing card and banner heights when adjusting spacing.

**Why:** The user repeatedly clarified that unwanted space meant the gaps between cards, not their height or the image's dark overlay.

**How to apply:** Keep the mosaic tightly aligned; do not add decorative vertical offsets that create empty space around adjacent cards.

Danceflow will be a paid app.

**Why:** The user explicitly clarified that the product is intended to be paid.

**How to apply:** Include payments and purchase accounting in production readiness, rather than treating monetization as optional for the public launch.

The user specified monthly subscriptions: 500 ₽ for 10 generations per day, 1,500 ₽ for 25 per day, and 2,500 ₽ for unlimited generations. They explicitly rejected RevenueCat and plan to connect YooKassa later.

**Why:** These are the user's chosen commercial terms and payment-provider direction, not inferred pricing recommendations.

**How to apply:** Preserve these terms in subscription offers. Do not connect RevenueCat or silently replace unlimited access with a quota. Until payment verification exists, plan selection must not activate paid access.
