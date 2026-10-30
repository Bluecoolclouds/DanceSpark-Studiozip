# Owner-selected Higgsfield models

The product owner explicitly selected **both Genjutsu Light v1.0 modes**:

| Mode | Endpoint ID | Product use |
| --- | --- | --- |
| Motion Transfer | `higgsfield/genjutsu-light/motion-transfer/v1.0` | Transfer a video's movement to referenced characters/scenes. Default dance workflow. |
| Object Swap | `higgsfield/genjutsu-light/object-swap/v1.0` | Replace a character, clothing or object in a source video using image references. |

Never silently use the more expensive non-Light `higgsfield/genjutsu/...` endpoints, legacy misspelt namespaces, or a different provider model. They are not equivalent budget choices.

## Verified public UI and published pricing

Sources reviewed on 2026-10-30:

- https://open.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/playground
- https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/playground

The model descriptions state that Light uses the first 15 seconds of the source video and preserves source audio. Both playgrounds offer one input video, up to eight image references, a prompt and output resolution 480p/720p/1080p.

Base rates before applicable discounts are **USD per total billable second**, the same for both modes:

| Resolution | USD/second | Example: 15s input + 15s output |
| --- | --- | --- |
| 480p | 0.05 | 1.50 USD |
| 720p | 0.10 | 3.00 USD |
| 1080p | 0.20 | 6.00 USD |

Billable seconds = rounded-up output duration + sum of input reference-video durations measured during provider preprocessing. Only the output is explicitly rounded up to whole seconds. Do not price output alone. The catalog also advertises discounts; never assume an account receives those discounts or silently halve these base rates.

The draft UI preview conservatively counts the full selected input duration until the prepared duration is known, while capping expected output to 15s. It labels this estimate as pre-processing, before discounts. Unknown source duration is unknown cost, not zero. There is no live USD/RUB conversion or claimed provider invoice.

## Contract verification still required before enabling paid requests

Use `/api-reference` in place of `/playground` on the exact model URL, as the owner instructed:

- https://open.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/api-reference
- https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/api-reference

These Light pages are accessible. On 2026-10-30 their extracted content provides a generic client/Bearer-auth example with only a sample prompt, not a complete required-input schema. In contrast, the standard Genjutsu pages document a different SDK and `Authorization: Key KEY_ID:KEY_SECRET`. Do not resolve this discrepancy by guessing the credential format or using a generic sample as a complete Light request. Confirm the actual Light schema and authentication before paid submissions.

The general Genjutsu docs describe the **non-Light** model and its 30-second source limit. They must not be treated as the exact Light contract. Do not inherit the standard model's four-second minimum without verifying it for Light.

The mobile form now persists the selected `model`, `resolution`, `sourceVideoUri`, `sourceVideoDurationSeconds`, `referenceImageUris` and optional `prompt` in local drafts. **`videoUri` remains generated output only.** Never expose the source video through generated-result sharing.

Before enabling the real generator:

1. Upload actual chosen media to durable storage and validate types, file sizes and durations on the server. Local file URIs/blob URLs are not public provider inputs.
2. Map the selected mode to a server allowlist of the exact Light endpoint IDs above. Reject arbitrary endpoint URLs from clients.
3. Replace the gateway's generic fixed per-job estimate with a **server-calculated** amount based on resolution and validated/preprocessed reference and output durations. Do not trust a client quote or duration for budget authorization.
4. Reserve enough budget before submission; reconcile any provider-reported billable durations and actual costs when available. The present fixed estimate is not a guarantee of actual AI spend.
5. Route all paid requests through authentication, paid subscription checks, atomic quota/concurrency/budget reservation and idempotency. See `GENERATION_GATEWAY.md`.
6. Wire actual provider progress/result handling; only then replace the local-draft action with real generation and update telemetry coverage.

These published base rates materially affect the economics of 500/1,500/2,500 RUB monthly plans with daily or unlimited usage. The owner's advertised prices and allowances have **not** been changed.
