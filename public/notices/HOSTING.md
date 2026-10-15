# Comparison deployment

This is a public comparison fork of Neil's [Steminize](https://github.com/Gerschwin/steminize), not an original app by the fork owner. The original interface and processing code are preserved.

- Comparison URL: https://kea1e.github.io/steminize/
- Upstream source commit: 22b57d6a9eb0dc93a4a6fdf32dd849edac0aeaf4
- Full corresponding fork source: https://github.com/kea1e/steminize
- Hosting: GitHub Pages, public static files, no hosted inference server or local tunnel.
- Processing: ONNX Runtime in the visitor's browser; models download from the upstream Hugging Face model repositories. No account or API key is required.
- First use downloads a large model. Processing time and memory depend on the visitor's device. Start with a short file and Chrome or Edge.
- Audio is processed locally. The app can retain songs in browser storage if Keep new songs is enabled. GitHub and model download hosts see normal web requests.
- Only process audio you have permission to use.

## Changes from upstream

The source-map-js development dependency was updated from 1.2.1 to 1.2.2 to clear the npm audit advisory. Licence and dependency notices are also included as static files under notices/ for the distributed build. No separation algorithms or UI features were rewritten.

## Rebuild and library replacement

Use Node.js 22, then run `npm ci`, `npm test`, and `npm run build`. Dependencies are unmodified npm packages; replace or modify soundtouchjs or @breezystack/lamejs in the public source and rebuild to use a different library build. See LICENSE, LICENCES.md, package-lock.json, and the upstream bundled Basic Pitch licence and notice.
