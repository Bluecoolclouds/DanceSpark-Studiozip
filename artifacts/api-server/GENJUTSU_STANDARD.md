# Standard Genjutsu: distinct from Light

The owner supplied these additional models and pricing references. They are documented here for integration decisions, **not automatically enabled as replacements for Light**.

Use the exact model's `/api-reference` URL rather than `/playground` for API parameters.

## Standard Motion Transfer and Object Swap

- https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/api-reference
- https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference

Verified on 2026-10-30:

- Endpoint IDs: `higgsfield/genjutsu/motion-transfer/v1.0` and `higgsfield/genjutsu/object-swap/v1.0`.
- Source at least 4 seconds, trimmed to first 30 seconds when longer.
- Required `video_url` and 1–8 `image_urls`.
- Optional `prompt` (default empty string, max 10,000 characters) and `resolution` (`480p`, default `720p`, or `1080p`).
- Object Swap additionally requires at least 409,600 source pixels per frame (width × height).
- These references show `@higgsfield/client/v2` and `Authorization: Key KEY_ID:KEY_SECRET`, unlike the generic example currently shown on the Light pages. Do not silently interchange credential formats or SDKs.

The owner's quoted base price for Motion Transfer and Object Swap is **per input-video second rounded up to a whole second**, before applicable discounts. Do not add output seconds as with Light.

| Resolution | Base USD/input second | Example: 15s input |
| --- | --- | --- |
| 480p | 0.318 | 4.770 |
| 720p | 0.681 | 10.215 |
| 1080p | 1.632 | 24.480 |

The pricing text for these two modes does not independently clarify whether billed input is measured before or after trimming. Verify this for long inputs before promising an exact estimate.

## Standard Restyle

https://open.higgsfield.ai/models/higgsfield/genjutsu/restyle/v1.0/api-reference

Restyles a video's subjects and scene while retaining movement, composition and source audio. This is a third purpose, not a variant of swapping a person.

- Endpoint ID `higgsfield/genjutsu/restyle/v1.0`.
- Required `video_url` and `preset_id` (UUID).
- Discover live styles through authenticated `GET /models/higgsfield/genjutsu/restyle/v1.0/presets`. Select an actual current `items[].id`; never hardcode the documentation's example UUID or use its name/preview URL as the ID.
- `image_urls` is optional and allows **0–5** character images, unlike Motion Transfer/Swap's 1–8. No character photos are required for restyling existing source subjects.
- Optional `prompt`, max 10,000 characters, defaults to empty string; optional `resolution`, defaults to `720p`.
- Source at least 4 seconds, at most 200 MiB; inputs over 30 seconds use the first 30. Each optional image at most 64 MiB.
- No independent duration, aspect-ratio, FPS, seed or start/end-time input. Presets control style; a prompt does not replace `preset_id`.
- Approximate rates: $0.318 / $0.681 / $1.632 per input second at 480p / 720p / 1080p. This reference explicitly rounds input duration up **after trimming to 30s**. Treat these rates as approximate, not a guaranteed final invoice.

## Product implications

Keep model family and operation separate in any future selector: **Light / Standard** versus **Transfer / Swap / Restyle**. Do not reuse the Light pricing formula, 15s output cap, or eight-photo form for Standard Restyle. Adding a pricier option requires explicit user selection and recalculated server budget reservations, never a silent fallback.

The monthly subscription prices and allowances have not been changed, and no paid generation was performed while checking these public references.
