---
name: Danceflow product direction
description: User's product intent and design-first scope for the mobile dance app.
---

The user wants a phone app for generating dances, conceptually like Higgsfield's dance feature, beginning with design. They explicitly requested a bright Just Dance-inspired feel and generated images.

**Why:** The user asked to start with design rather than a functioning video-generation integration.

**How to apply:** Keep the original energetic dance identity and custom artwork in future screens. Treat actual video generation as a separate next step; never present a saved design draft as a generated video.

For the Hallmark redesign, the user chose to preserve bright colors and dance character, rejected the yellow screen as unclear and cheap-looking, and requested the character of Just Dance 4 with a transparent pill-shaped bottom menu.

**Why:** The user explicitly described what felt wrong and the desired replacement. Brightness does not mean retaining the cream/yellow base.

**How to apply:** Preserve the energetic identity, avoid cream/yellow as the main surface, and keep floating translucent bottom navigation. Do not interpret Hallmark as permission to replace the dance identity with a generic minimalist AI interface.

The user supplied five real video templates and chose “Заменить демонстрационные танцы”. The accompanying photo of a character in armor must not be used for now (“Пока не использовать”).

**Why:** This was the user's explicit catalogue choice, not permission to add the photo as a preset character or cover.

**How to apply:** Keep the uploaded clips as the visible catalogue rather than mixing the original fictional dances back in. Preserve older draft references without advertising the old demo dances as current templates. Do not invent BPM, performer identities, or choreography descriptions for the supplied videos.

The user wants the dance cards nearly touching, with less rounding and no large vertical gaps between rows. Preserve the existing card and banner heights when adjusting spacing.

**Why:** The user repeatedly clarified that unwanted space meant the gaps between cards, not their height or the image's dark overlay.

**How to apply:** Keep the mosaic tightly aligned; do not add decorative vertical offsets that create empty space around adjacent cards.

Danceflow will be a paid app.

**Why:** The user explicitly clarified that the product is intended to be paid.

**How to apply:** Include payments and purchase accounting in production readiness, rather than treating monetization as optional for the public launch.

The user specified monthly subscriptions: 500 ₽ for 10 generations per day, 1,500 ₽ for 25 per day, and 2,500 ₽ for unlimited generations. They explicitly rejected RevenueCat and plan to connect YooKassa later.

**Why:** These are the user's chosen commercial terms and payment-provider direction, not inferred pricing recommendations.

**How to apply:** Preserve these terms in subscription offers. Do not connect RevenueCat or silently replace unlimited access with a quota. Until payment verification exists, plan selection must not activate paid access.

For the paid service, “unlimited” means no daily generation-count cap, not unrestricted parallel AI spending. Keep administrative emergency controls distinct from the advertised plan allowance. Administrative cost figures must be labelled estimates until provider billing data is available.

**Why:** Published base rates are now known for the selected Light models, but actual discounted costs have not been reconciled with provider bills. A failed upstream job may still incur a charge, so presenting configured estimates as actual expenses or promising unrestricted simultaneous work would be misleading.

**How to apply:** Preserve the unlimited plan's absence of a daily count cap while retaining explicit concurrency and spending protection. Do not claim profitable pricing or an exact provider balance from locally configured estimates.

The user explicitly selected both Higgsfield **Genjutsu Light v1.0** modes: Motion Transfer and Object Swap, and named their playgrounds as references for the creation page.

The user also wants the trend page itself to follow the Object Swap playground, with the same input fields, rather than just information about the dance.

**Why:** They explicitly supplied the Genjutsu Light Object Swap playground as the reference for improving the trend page.

**How to apply:** Treat the selected trend as the prefilled source in an editable workspace; preserve the distinction between Object Swap and Motion Transfer and between a saved draft and an actual generated result.

**Why:** This is the user's provider/model choice. The similarly named standard Genjutsu has different pricing and limits and is not an interchangeable substitute.

**How to apply:** Keep both Light modes, explain their different purposes, and never silently replace them with standard Genjutsu or another provider. Preserve the user's subscription prices pending their decision about the resulting economics.

The user also supplied standard Genjutsu Motion Transfer, Object Swap and Restyle as additional model references. For Higgsfield API settings, they instructed: replace `/playground` with `/api-reference` in the model URL.

**Why:** The user provided the correct documentation route; similarly named models have different contracts and billing rules.

**How to apply:** Consult each exact model's `/api-reference` rather than inferring its contract from another model or a guessed documentation URL. The additional references do not by themselves authorize silently replacing the selected Light models.
For real generation, the user explicitly selected Higgsfield rather than fal.ai.

**Why:** The user confirmed “Да, используем Higgsfield” when asked to distinguish the providers.

**How to apply:** Use Higgsfield's documented server-side API. Do not silently substitute another billable provider.
