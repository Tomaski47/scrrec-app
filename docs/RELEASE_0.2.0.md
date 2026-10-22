# 0.2.0 — reliability and maintenance

Status: release candidate, September 22, 2026. Deploy after the physical-device acceptance checks below. This change does not itself deploy production or tag a public release.

October 21 release execution: Vite is updated to 6.4.5 and source-map-js to 1.2.2; unused Tailwind tooling is removed, clearing the nine newly affected development/build packages. The dependency audit again reports zero findings. CSS output is byte-for-byte unchanged. Release acceptance is in progress; see the [current roadmap](KNOWN_ISSUES_AND_FUTURE_WORK.md) and [local transcription proposal](LOCAL_TRANSCRIPTION_ROADMAP.md).

## Changes

- Completed files survive new recording attempts, cancelled permission pickers, and source-selection changes. Clear All and tab lifetime control their retention.
- Capture startup is locked synchronously. Each additional screen opens from an explicit user gesture. Cancellation, encoder errors, source termination, and final-data events share one cleanup path; bounded finalization preserves available partial files.
- Downloads use actual MIME types and matching extensions. Audio quality requests are 64/128/256 kbps. Microphone-only capture does not probe cameras. Multiple microphones produce one mixed track per video plus separate audio files.
- Stable recording previews, honest download/share feedback, keyboard-friendly dialogs, visible focus, and reduced-motion support.
- Node 24 LTS, updated compatible dependencies, removed unused runtime packages, strict type checking, recorder regression tests, CI checks and container smoke tests, monthly Dependabot updates.
- Production health/version endpoints, cache behavior, and consistent security headers. CSP stays report-only until deployed assets and hosting integrations have been observed.
- Video-only MIME choices omit audio codecs, fixing a Firefox finalization stall reproduced during acceptance. The regression is covered in the lifecycle suite and real Firefox encoder checks.
- Relative nginx directory redirects preserve HTTPS behind a TLS-terminating proxy. Cloudflare-origin HTTP requests redirect to HTTPS, with a one-day HSTS policy. An insecure-page recording error now explains how to open the secure page. These changes fix the HTTP downgrade found during the iPhone/desktop preview check.

## Verification performed

- `npm run check` on Node 24: lint, 12 lifecycle/format regression tests, both TypeScript configurations, and production build.
- `npm audit`: zero reported vulnerabilities across production and development dependencies at the time of preparation. This is a point-in-time result, not a permanent guarantee.
- Local production Docker image builds and starts; nginx configuration validates. Health and release metadata return 200, HTML/metadata revalidate, missing JavaScript returns 404, and security headers apply to assets.
- Chromium browser checks use synthetic canvas/oscillator input with real MediaRecorder encoding: retained outputs after failed/successful retries, locked startup, real download, MP4 extension, source termination, microphone permission scope/bitrate, multiple screens, camera plus two microphones with one mixed video audio track and separate audio files, share/capture cancellation, keyboard dialog dismissal/focus restoration, and a 390px mobile viewport.

Synthetic capture does not exercise OS pickers, actual microphone/camera hardware, Safari/Firefox encoders, mobile resource limits, or long-session memory growth.

October 21 additional checks: physical Mac FaceTime HD camera plus built-in microphone capture and playback passed; test media was cleared. Firefox now passes screen-only recording, retained-output/retry flows, microphone-only capture, multiple screens, camera plus two microphones, and playback of all three combined-source files. Native desktop Safari automation was unavailable (remote automation disabled); a WebKit automation engine did not launch successfully. Physical iPhone testing and the 30-minute concurrent recording test are tracked separately and must not be inferred from these desktop results.

## Reproduce browser checks

Start the app on localhost (or map the production container to a localhost port). Install the Playwright CLI/browser using its official setup, then run from the repository root:

```bash
mkdir -p output/playwright
npx --yes --package @playwright/cli playwright-cli -s=release open http://127.0.0.1:5174 --headed
npx --yes --package @playwright/cli playwright-cli -s=release run-code "$(cat scripts/browser-setup.js)"
npx --yes --package @playwright/cli playwright-cli -s=release run-code "$(cat scripts/browser-regression.js)"
npx --yes --package @playwright/cli playwright-cli -s=release run-code "$(cat scripts/browser-combinations.js)"
npx --yes --package @playwright/cli playwright-cli -s=release close
```

The fixture only accepts localhost URLs. It replaces acquisition in that isolated browser session, uses generated media, and leaves screenshots/downloads local. Do not commit those artifacts. The combination check covers camera plus two microphones, share cancellation, and cancellation before the second screen picker.

## Deployment acceptance

- [ ] Hosted CI passes for the final commit.
- [ ] Desktop Chrome: real screen + named mic + camera, playback with audible audio, retry after picker cancellation, and browser Stop sharing.
- [ ] Desktop Firefox and Safari: screen/mic/camera individually, combined capture where supported, playback and filename/container checks.
- [ ] iPhone Safari: camera/mic capture, download/share cancellation and success, portrait preview. Screen capture availability remains browser-dependent.
- [ ] A 30-minute recording completes and plays to the end; observe memory growth and audio sync. Save files before reloading.
- [ ] Verify deployed `/version.json` identifies the approved build and `/healthz` is healthy. Inspect response headers after any CDN/reverse proxy and check CSP reports in the browser console before considering enforcement.
- [ ] Smoke-test the deployed app, then tag/publish `v0.2.0` with this changelog.

Build from the approved commit using Node 24 and `npm ci`, or build the Docker image with `--build-arg BUILD_REVISION=<approved-commit>`. CI-generated artifacts include the GitHub commit in `version.json`. The checked-in `dist` remains available for the existing static deployment path; a local build is explicitly identified as `local` unless `BUILD_REVISION` is provided.

Keep the previous static bundle or image digest before switching traffic. Roll back by redeploying that exact artifact; there is no server-side database migration. Users must save active recordings before a reload or deployment-related refresh.
