---
name: Dance video preview compatibility
description: Keep provider originals distinct from browser-compatible playback versions.
---

The preview browser reported generic MP4 support but no support for the uploaded H.264/AAC codecs. Valid byte-range responses and successful file inspection were insufficient to establish browser playback.

**Why:** The real uploaded clips must remain usable as source material, while web preview may need a different codec. Replacing the original with the web preview would silently change the generation input.

**How to apply:** Retain original source URLs and measured input durations in drafts; treat browser-compatible previews as presentation assets only. Verify explicit codec support or actual playback with advancing current time, not just HTTP 200/206 or `canPlayType('video/mp4')`. Provide an explicit touch-accessible play control.
