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

## Production verification

Implementation commit: `b6dee1599bb5a14faeff6d4876943f221fd18330`.

Published at `https://kea1e.github.io/steminize/` by successful Pages run `38810214978` (2026-10-15). The final receipt-only commit does not change built application bytes.

- Local full suite: 414 PASS lines (410 existing assertions plus four worker/client integration groups). TypeScript/Vite build and diff checks pass; npm audit reports zero vulnerabilities.
- Pages CI: successful test, build and deploy. CI logged 410 PASS lines and skipped four pre-existing ffmpeg encoder checks because its runner lacks ffmpeg. All four encoder checks passed locally with real ffmpeg.
- Anonymous HTTPS HTML, main JavaScript, GPU worker, CPU worker and Basic Pitch licence matched the local build byte for byte.
- Production GPU worker: `assets/workerGpu-BTAOmQye.js`, SHA-256 `fbceb93aa7c4f2ad62950ad69ceccd0beb995937aee9bdbeaec90312970e3d52`.
- Actual production file selection, separation, Re-run and WAV export completed in the named release browser. Unmodified production worker, browser deviceMemory=8, WebGPU, same 2-second synthetic stereo fixture, 6-stem Compact, shifts=1, overlap=.25: first job 134.938 seconds, repeat 1.943 seconds. These worker dispatch-to-result timings exclude model download and decode. UI displayed `Done in 2m 15s` then `Done in 2s`.
- Both production jobs returned all six stereo stems, 88,200 samples per channel, every sample finite. Only one model-byte request and one initialization stage occurred across both jobs. The built-worker low-memory-policy probe above independently counted one actual ORT session creation across three jobs.
- Export mix produced a real downloaded WAV verified by ffprobe/ffmpeg: PCM signed 16-bit little-endian, stereo, 44,100 Hz, exactly 2 seconds, decoded successfully. This is a technical smoke test, not a musical-quality assessment.
- Visually inspected production initialization feedback and completed six-track player/queue screenshots. Temporary local preview servers were stopped; no local service was exposed.
