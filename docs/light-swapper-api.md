# Light Swapper server API

## Verified official contracts

Checked 2026-10-31, without credentials or paid requests:

- [Model discovery/source priority](https://docs.higgsfield.ai/docs/llms.txt)
- [Motion Transfer Light v1.0 schema and cURL](https://dash.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/llms.txt)
- [Object Swap Light v1.0 schema and cURL](https://dash.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/llms.txt)
- [Uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)
- [Status](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status.md)

The selected model-specific documentation is authoritative. The shared supplementary
OpenAPI catalogue or the non-Light Genjutsu docs are not substitutes.

Both models use production `https://api.higgsfield.ai/` followed by their exact ID:

- `higgsfield/genjutsu-light/motion-transfer/v1.0`
- `higgsfield/genjutsu-light/object-swap/v1.0`

Both accept `video_url`, an ordered `image_urls` array (1–8), `prompt` (up to
10,000 characters, empty allowed), and `resolution` (`480p`, `720p`, `1080p`).
They use the first 15 seconds and preserve source audio. No documented duration,
audio-toggle, negative-prompt, scene-timing or per-character binding parameter is
implemented. Reference order is preserved; exact likeness or individual binding is
not guaranteed. Account-specific model entitlement has **not** been tested.

The shared upload contract is `POST /files/generate-upload-url` with
`content_type`, then `PUT upload_url` with exactly the returned `upload_headers`.
Only the API request gets `Authorization: Key ID:secret`. Upload handles are
temporary (documented one-hour expiration). Storage credentials, upload handles
and input URLs are never returned to the app.

## Application contract

`POST /api/light-swapper/generations` requires the existing verified Clerk
identity and a server account with an active paid subscription. Cookie mutations
require same origin; native mutations require a verified bearer token without an
Origin header. User IDs and admin flags in the payload or headers grant nothing.

Example (replace the example photo with real base64 bytes; do not send local URIs):

```json
{
  "clientRequestId": "persisted-draft-unique-id",
  "model": "higgsfield/genjutsu-light/motion-transfer/v1.0",
  "templateId": "trend-01",
  "photos": ["data:image/jpeg;base64,...", "data:image/png;base64,..."],
  "prompt": "Use both selected characters and keep the original scene.",
  "resolution": "720p"
}
```

The server accepts only known fields and inline JPEG, PNG or WebP with matching
signatures. The JSON limit is 18 MiB; decoded photos must total at most 12 MiB.
These are application safety limits, not claims about undocumented provider limits.
No arbitrary URL, local URI, bucket key, preview selector or client price is accepted.

The template must exist and be published. The server reads only its original
`video.mp4` from the fixed R2 namespace, pins the read to its ETag, checks MP4
signature and exact size (at most 100 MiB), then uploads those bytes. Browser WebM
and MP4 previews are never provider inputs. Missing/inconsistent originals block
submission, not trigger a substitute.

`202` contains only an application `requestId` and `status: "queued"`. Poll the
existing owner-protected `GET /api/video-generations/{requestId}`. That endpoint
returns `queued`, `processing`, `completed`, or `failed`; only completion includes
the HTTPS output URL. Responses are `no-store`. Provider IDs are never exposed.
Completed Light output URLs are retained server-side so further reads do not
depend on successful polling. Output storage/retention remains the provider's:
links are not permanent and no application archival is claimed.

Transient polling failure returns a retryable HTTP error without changing the
job to failed, charging again or releasing its reservation. Unknown statuses or
malformed/unsafe output are likewise not fabricated as successful completions.

## Spending, idempotency and operations

- Existing block, subscription, pause, daily quota, concurrency and RUB budget
  controls apply atomically before uploading. Pause, account, subscription and
  template publication are checked again after uploads, immediately before the
  single paid POST.
- Configure an operator-approved **conservative** `DANCEFLOW_LIGHT_USD_RUB`
  conversion rate and accurate catalogue `sourceDurationSeconds` before allowing
  Light generation. Missing/invalid values fail closed with
  `light_pricing_not_configured` (503). No conversion value is set by this work.
- Reserve at least `(full input seconds + ceil(min(input seconds,15))) * rate *
  USD_RUB`, rounded up to kopeks. Official undiscounted rates are $0.05/$0.10/$0.20
  for 480p/720p/1080p. The existing administrator RUB estimate remains a lower bound
  if larger. This is a spending estimate, not a new customer tariff or subscription.
  Input duration comes from trusted editorial metadata, not the request; operators
  must recheck it when replacing an original. Actual provider preprocessing/billing
  and currency conversion can differ, so configure a safety margin.
- The owner-scoped idempotency record binds model, template, ordered decoded
  photos, exact prompt and resolution using SHA-256; no photos/prompts are stored.
  The first attempt resolves the template's then-current original; replays never
  fetch a newly replaced version or submit again. A changed parameter conflicts
  (409), including switching model or reordering photos. Cross-route collisions
  with legacy PixVerse also conflict.
- Any uncertainty after starting the paid POST (including non-2xx, missing ID,
  unreadable acknowledgement, or failure to save the ID) becomes
  `submission_unknown`. It retains quota and estimated spend. Never automatically
  resubmit, even on a new server process. Check Higgsfield Console manually first.
- Proven failures before the paid POST release daily quota, but retain the attempt's
  estimated spend and idempotency record, following existing conservative policy.
- Crashed Light submissions without a provider ID recover after 30 minutes,
  allowing time for a video and eight serial image uploads. Legacy PixVerse's
  10-minute recovery threshold and submission contract remain unchanged.

Apply the additive `df_jobs` schema changes in development with
`pnpm --filter @workspace/db push`. The existing post-merge script also applies
the schema. No production enablement, real generation or subscription changes
are part of this implementation.

## Mobile launch and recovery

- Saving a draft never submits a generation. Its own screen has an explicit
  consent panel with the selected endpoint, resolution, photo count, approximate
  USD provider cost and the paid/material-transfer warning. Cancelling leaves
  the draft untouched. PixVerse remains a separate path.
- The mobile client persists the ordered photo bytes and exact prompt. Native
  picker media is copied out of the temporary cache; browser picker media
  is stored in IndexedDB, not in transient blob URLs or size-limited
  localStorage values. Local copies remain
  device/browser-specific and are not a cloud backup.
- This API still only accepts published catalogue originals. A draft with a
  user-selected video, a different preview URL, or insufficient legacy metadata
  is explicitly blocked from Light submission. It remains saveable/viewable;
  the client never silently replaces it with the catalogue video or PixVerse.
  Supporting custom-video generation requires a separate authenticated upload
  contract, trusted validation/duration and spending checks on the server.
- Before POST the client must durably save `lightSubmissionStarted`. If local
  persistence fails, no POST is sent. A lost response keeps that marker and
  never causes another automatic POST, including after closing the screen.
- `GET /api/light-swapper/generations/by-client/{clientRequestId}` is an
  authenticated owner-scoped recovery read. It returns `VideoGenerationStatus`
  or JSON `null` when no matching owned Light reservation exists; it cannot
  create a job. It excludes PixVerse jobs and returns `Cache-Control: no-store`.
  A null result is not proof that a paid provider request was rejected.
- Queued, processing, uncertain and failed attempts retain the same draft key.
  Reopening observes the same reservation. Transient status errors do not clear
  IDs, consent markers or results. Uncertain attempts direct the user to manual
  verification in Higgsfield Console, not a fresh billable request.
- Generated `videoUri` is separate from any catalogue example. The existing
  playback, library-save and share actions use only that generated URI.

## Verification without spending

`pnpm --filter @workspace/api-server test` uses a disposable PostgreSQL cluster,
synthetic credentials, mocked Higgsfield and R2, and guards against external HTTP
and TCP. The Light tests cover both exact endpoints, all resolutions, eight ordered
photos, original MP4 bytes, replays/conflicts, access and budget races, changing
access during upload, upload/type/size failures, ambiguous submissions, recovery,
ownership, transient status failure and cached completion. Existing PixVerse
regression tests continue to run in the same suite.
