---
name: Light mobile launch safety
description: Why mobile Light recovery reads by the saved draft key and custom videos remain draft-only.
---

Keep recovery of uncertain Light launches read-only. Persist the submission
marker before sending, and use the saved draft's client key to find the owned
reservation after a lost acknowledgement.

**Why:** A missing HTTP response does not establish whether a paid job started.
Recreating a draft or automatically retrying a paid POST would obscure that
uncertainty. A successful local save is part of the safety boundary.

**How to apply:** Local storage failures must block paid submission. Null recovery
results and status-read errors must not clear the marker or trigger a new POST.

Custom-video inputs must not silently become catalogue originals.

**Why:** The current server contract deliberately accepts published catalogue
originals only; accepting arbitrary video URLs would bypass trusted duration,
media validation and spending controls.

**How to apply:** Keep custom-video drafts usable locally, but add a separately
validated authenticated upload contract before enabling their paid generation.
