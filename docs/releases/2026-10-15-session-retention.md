# Session retention release (2026-10-15)

## Scope

Keep initialized ordinary separation models between songs when browser `deviceMemory` is below 8 GB or missing. The existing LRU limits remain one session on low/unknown-memory browsers and four on capable browsers. Model/backend/precision changes still evict before allocating beyond the limit. Fine-tuned specialist bags, including one selected specialist, retain their immediate-release behavior on the one-session path. Failed jobs clear/release cached sessions for recovery. Explicit cancellation still terminates and replaces the worker.

Cold startup now distinguishes reading cached model bytes from initializing the inference session, with an honest warning that first use can take minutes. Warm hits no longer display a false loading stage. No new preparation action, background preload, model swap or quality mode was introduced. Default settings, model weights, shifts, overlap, separation maths, player/export UX and attribution files are unchanged.

## Regression verification

- Baseline: 410 existing PASS assertions, TypeScript/Vite build successful, npm audit reports zero vulnerabilities.
- Test-first reproduction: the real worker message/job path created two ordinary sessions for two jobs with both `deviceMemory=4` and missing `deviceMemory`; each assertion failed expecting one session before the fix.
- Added worker-path integration tests using a deterministic fake ONNX network, not a replacement worker/cache. Coverage includes low/unknown/8 GB reuse, stage reporting, model/backend switching, specialist cleanup, selected-single-specialist cleanup, four-session LRU eviction, failed-inference cleanup/retry and explicit client cancellation.
- Run tests with Node 22, matching Pages CI: `npx -y -p node@22 -c 'npm test'`. The host default Node 26 does not support the repository's existing experimental-transform-types flag.
- Release gates: full suite, `npm run build`, `npm audit`, and `git diff --check`.

## Measured browser behavior before publication

Exact built GPU worker, headless Chromium 145 on an M3 Max, Apple/metal-3 adapter, WebGPU, eight WASM threads, cross-origin isolated. The worker's `deviceMemory` was explicitly set to 4 to exercise the one-session policy on this high-memory machine. This is policy emulation, not a physical low-memory-device benchmark.

Default 6-stem Compact model, one shift, 25% overlap, synthetic stereo PCM fixtures:

| Job | Audio | Worker elapsed | Session creations |
| --- | --- | --- | --- |
| Fresh worker | 2 s | 16.429 s | 1 (12.873 s inside ORT create) |
| Same worker repeat | 2 s | 1.461 s | 0 |
| Same worker longer | 12 s | 4.755 s | 0 |

Three jobs produced all six stereo stems with exact expected lengths and finite samples. There was one model-byte request and one session creation across all three jobs. Timings exclude download and decode. Instrumentation wraps the built worker; these are engine measurements, not full upload-to-export measurements.

Earlier diagnostic fresh-worker measurements were 131.957 and 139.535 seconds, with 1.627 to 1.854 second warm two-second runs and 4.726 to 4.801 second warm twelve-second runs. Browser/driver caches were not purged. The shorter fresh-worker result above is **not evidence that this patch accelerates ORT initialization**. The demonstrated fix is session retention and avoiding unnecessary reinitialization between jobs.

## Limits and publication verification

The first session still must initialize. Reloading the page, cancellation, worker loss, cache eviction, model/backend changes or failed inference can require initialization again. The existing worker-local 60-second GPU timeout cannot reliably interrupt synchronous ORT work; it is not a guaranteed wall-clock bound and was not redesigned here.

Peak memory, physical low-memory devices, CPU-only throughput, full-song throughput and perceptual quality were not benchmarked. No paid API, remote inference service or local service exposure was introduced. Retained model memory is bounded but remains allocated while the worker is alive; cancel an active job or reload to explicitly reclaim it.

Publication target: `https://kea1e.github.io/steminize/` through the existing main-branch GitHub Pages workflow. Final deployment verification must independently match the pushed commit to a successful Actions run, compare anonymous HTTP HTML and worker bytes with this build, and exercise the production browser. Do not interpret this pre-publication note as a deployment-success receipt by itself.
