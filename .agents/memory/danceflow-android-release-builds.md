---
name: Danceflow Android release builds
description: Resource and toolchain constraints for native Android builds in this workspace
---

For native Android releases in this workspace, put `GRADLE_USER_HOME` and `TMPDIR` under workspace-backed `generated-artifacts/`, not the small root filesystem. The root overlay filled when the default Gradle cache grew to roughly 3.8 GB; moving the cache preserved it and allowed the release build to finish.

Use OpenJDK 19 with Android API 37 here; the default GraalVM 19 failed during `jlink`. Constrain native CMake/Ninja parallelism as well as Gradle workers, because `--max-workers=1` alone does not cap native compilation. Concurrent Expo and service workflows can also push memory over the limit, so stop them during the build and restart them afterward.

**Why:** Earlier release attempts hit both OOM and root-disk exhaustion; moving the cache, limiting concurrency, and reducing concurrent workflows let the same build complete without deleting caches.

**How to apply:** Before future Android release builds, verify workspace free space, use workspace-backed Gradle/temp directories and the known JDK, limit CMake/Ninja and Gradle parallelism, temporarily stop competing workflows, and restore them after the build.
