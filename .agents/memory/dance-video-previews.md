---
name: Dance video preview compatibility
description: Keep provider originals distinct from browser-compatible playback versions.
---

The preview browser reported generic MP4 support but no support for the uploaded H.264/AAC codecs. Valid byte-range responses and successful file inspection were insufficient to establish browser playback.

**Why:** The real uploaded clips must remain usable as source material, while web preview may need a different codec. Replacing the original with the web preview would silently change the generation input.

**How to apply:** Retain original source URLs and measured input durations in drafts; treat browser-compatible previews as presentation assets only. Verify explicit codec support or actual playback with advancing current time, not just HTTP 200/206 or `canPlayType('video/mp4')`. Provide an explicit touch-accessible play control.

Do not force WebM for every web browser. Select a preview using explicit codec support and retain an alternative format on decoding failure.

**Why:** A version that plays in the testing Chromium is not proof it will play in a user's Safari or embedded browser. Playback failures must not automatically be blamed on the user's connection.

Expo Video on web renders a raw HTML video element. Absolute positioning with four edges alone does not constrain its intrinsic dimensions; explicitly set width and height before relying on contain fitting.

**Why:** A portrait sample overflowed and was clipped despite contentFit="contain"; increasing the container height did not fix the intrinsic sizing.

**How to apply:** Constrain both video dimensions to its container, keep contain fitting, and bound preview height to the viewport rather than making portrait previews arbitrarily tall.

Expo image picker in the installed version returns video duration in seconds on web (from HTMLVideoElement), but milliseconds on native.

**Why:** Treating both as milliseconds turned a 13-second uploaded video into 0.013 seconds and understated the estimate.

**How to apply:** Normalize picker durations by platform, verifying the installed web implementation when upgrading Expo. Do not automatically reinterpret previously saved draft durations.
