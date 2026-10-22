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

- iPhone and iPad camera choices are exclusive even when Safari exposes real front/rear device IDs. This prevents opening a second camera from muting the first; iPad desktop browsing is included. Desktop multiple-camera selection remains available.
- File sharing uses container MIME metadata, shows feedback beside the relevant file, and serializes share attempts. Cancellation releases the lock, Save remains available while sharing, and a stalled browser share shows recovery instructions without discarding files.

## Verification performed

- `npm run check` on Node 24: lint, 14 lifecycle/format/camera-policy regression tests, both TypeScript configurations, and production build.
- `npm audit`: zero reported vulnerabilities across production and development dependencies at the time of preparation. This is a point-in-time result, not a permanent guarantee.
- Local production Docker image builds and starts; nginx configuration validates. Health and release metadata return 200, HTML/metadata revalidate, missing JavaScript returns 404, and security headers apply to assets.
- Chromium browser checks use synthetic canvas/oscillator input with real MediaRecorder encoding: retained outputs after failed/successful retries, locked startup, real download, MP4 extension, source termination, microphone permission scope/bitrate, multiple screens, camera plus two microphones with one mixed video audio track and separate audio files, share/capture cancellation, keyboard dialog dismissal/focus restoration, and a 390px mobile viewport.

Synthetic capture does not exercise OS pickers, actual microphone/camera hardware, mobile resource limits, or a physical perceptual audio-sync reference. Native Firefox encoding is covered separately below.

October 21 additional checks: physical Mac FaceTime HD camera plus built-in microphone capture and playback passed; test media was cleared. Firefox now passes screen-only recording, retained-output/retry flows, microphone-only capture, multiple screens, camera plus two microphones, and playback of all three combined-source files. Native desktop Safari automation was unavailable (remote automation disabled); a WebKit automation engine did not launch successfully. Physical iPhone testing is tracked separately and must not be inferred from these desktop results. The first phone pass confirmed microphone and rear-camera recording with audio; selecting front and rear together produced a black front-camera file, and cancelling Share left subsequent attempts unresponsive. Camera policy and Share feedback/serialization are repaired; a fresh physical phone pass is pending.

October 21 extended acceptance:

- Chrome native tab capture through `getDisplayMedia` recorded and played to the end (4.56 seconds, 2992×1780). The captured tab contained only generated test content.
- A concurrent screen, camera, and microphone soak ran for 1,825.6 seconds using synthetic canvas/oscillator sources with native Chrome VP9/Opus encoders. All three downloads succeeded: two 200,090,111-byte videos and one 58,629,060-byte audio file. Every video and audio stream decoded fully with no warnings; browser playback from 1,818 seconds reached the end of all three files. Audio/video end timestamps differed by at most 50 ms within each video; this is a timestamp check, not a perceptual sync measurement.
- The soak reported no recording errors. Sampled JavaScript heap ranged below 16.1 MB and ended at 7.4 MB. This excludes retained Blob/native media storage: completed files totaled about 437.6 MiB, so recording memory still grows with output size. The soak page was isolated from development-server hot reload; the audio-bearing recorder path was unchanged by subsequent video-only MIME and export UI fixes.
- Updated Chrome browser checks cover a pending share, download during sharing, a stalled-share message, cancellation, sharing another file, success, and retrying the original file. Shared file MIME metadata excludes codec parameters. A simulated iPad desktop user agent with two real camera IDs confirms selecting one camera replaces the other and produces one output. Physical iPhone confirmation remains required.

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

The fixture only accepts localhost URLs. It replaces acquisition in that isolated browser session, uses generated media, and leaves screenshots/downloads local. Do not commit those artifacts. The combination check covers camera plus two microphones, share cancellation/retries/stalls with download fallback, and cancellation before the second screen picker. Run `scripts/browser-mobile-cameras.js` last in the isolated session to check camera selection under a simulated iPad desktop browser identity; this does not emulate Safari encoding or iPhone hardware.

## Deployment acceptance

- [ ] Hosted CI passes for the final commit.
- [ ] Desktop Chrome: real screen + named mic + camera, playback with audible audio, retry after picker cancellation, and browser Stop sharing.
- [ ] Desktop Firefox and Safari: screen/mic/camera individually, combined capture where supported, playback and filename/container checks.
- [ ] iPhone Safari: camera/mic capture, download/share cancellation and success, portrait preview. Screen capture availability remains browser-dependent.
- [x] A 30-minute concurrent recording completes, downloads, fully decodes, and plays to the end. Memory and stream timestamps were checked as described above; perceptual hardware sync remains outside this synthetic test.
- [ ] Verify deployed `/version.json` identifies the approved build and `/healthz` is healthy. Inspect response headers after any CDN/reverse proxy and check CSP reports in the browser console before considering enforcement.
- [ ] Smoke-test the deployed app, then tag/publish `v0.2.0` with this changelog.

Build from the approved commit using Node 24 and `npm ci`, or build the Docker image with `--build-arg BUILD_REVISION=<approved-commit>`. CI-generated artifacts include the GitHub commit in `version.json`. The checked-in `dist` remains available for the existing static deployment path; a local build is explicitly identified as `local` unless `BUILD_REVISION` is provided.

Keep the previous static bundle or image digest before switching traffic. Roll back by redeploying that exact artifact; there is no server-side database migration. Users must save active recordings before a reload or deployment-related refresh.
