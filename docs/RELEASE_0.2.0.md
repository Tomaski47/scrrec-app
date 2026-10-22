# 0.2.0 — reliability and maintenance

Status: shipped October 21, 2026. [PR #1](https://github.com/Tomaski47/scrrec-app/pull/1) is merged and production verification passed. See the [v0.2.0 publication record](https://github.com/Tomaski47/scrrec-app/releases/tag/v0.2.0) for the final release revision and distributable.

October 21 release execution: Vite is updated to 6.4.5 and source-map-js to 1.2.2; unused Tailwind tooling is removed, clearing the nine newly affected development/build packages. The dependency audit again reports zero findings. Removing unused Tailwind tooling left CSS byte-for-byte unchanged; the separate mobile styling changes are listed below. Release acceptance and production checks passed within the coverage described below; see the [current roadmap](KNOWN_ISSUES_AND_FUTURE_WORK.md) and [local transcription proposal](LOCAL_TRANSCRIPTION_ROADMAP.md).

## Changes

- Completed files survive new recording attempts, cancelled permission pickers, and source-selection changes. Clear All and tab lifetime control their retention.
- Capture startup is locked synchronously. Each additional screen opens from an explicit user gesture. Cancellation, encoder errors, source termination, and final-data events share one cleanup path; bounded finalization preserves available partial files.
- Downloads use actual MIME types and matching extensions. Audio quality requests are 64/128/256 kbps. Microphone-only capture does not probe cameras. Multiple microphones produce one mixed track per video plus separate audio files.
- Stable recording previews, honest download/share feedback, keyboard-friendly dialogs, visible focus, and reduced-motion support.
- Node 24 LTS, updated compatible dependencies, removed unused runtime packages, strict type checking, recorder regression tests, CI checks and container smoke tests, monthly Dependabot updates.
- Production health/version endpoints, cache behavior, and consistent security headers. CSP stays report-only until deployed assets and hosting integrations have been observed.
- Video-only MIME choices omit audio codecs, fixing a Firefox finalization stall reproduced during acceptance. The regression is covered in the lifecycle suite and real Firefox encoder checks.
- Relative nginx directory redirects preserve HTTPS behind a TLS-terminating proxy. Cloudflare-origin HTTP requests redirect to HTTPS, with a one-day HSTS policy. An insecure-page recording error now explains how to open the secure page. These changes fix the HTTP downgrade found during the iPhone/desktop preview check.
- Source rows use plain unchecked backgrounds and a subtle selected accent in both themes. Mobile Safari no longer renders an empty desktop-browser notice.
- Apple mobile recording prefers native MP4/H.264/AAC video and M4A/AAC audio when supported, with capability-based fallback and actual-container filenames.
- Camera choices retain browser-provided lens and combined-mode names; only genuinely identical labels are numbered. This avoids presenting Safari’s virtual camera modes as indistinguishable rear cameras.
- iPhone and iPad camera choices are exclusive even when Safari exposes real front/rear device IDs. This prevents opening a second camera from muting the first; iPad desktop browsing is included. Desktop multiple-camera selection remains available.
- File sharing uses container MIME metadata, shows feedback beside the relevant file, and serializes share attempts. Cancellation releases the lock, Save remains available while sharing, and a stalled browser share shows recovery instructions without discarding files.

## Verification performed

- `npm run check` on Node 24: lint, 16 lifecycle/format/camera-policy regression tests, both TypeScript configurations, and production build.
- `npm audit`: zero reported vulnerabilities across production and development dependencies at the time of preparation. This is a point-in-time result, not a permanent guarantee.
- Local production Docker image builds and starts; nginx configuration validates. Health and release metadata return 200, HTML/metadata revalidate, missing JavaScript returns 404, and security headers apply to assets.
- Chromium browser checks use synthetic canvas/oscillator input with real MediaRecorder encoding: retained outputs after failed/successful retries, locked startup, real download, MP4 extension, source termination, microphone permission scope/bitrate, multiple screens, camera plus two microphones with one mixed video audio track and separate audio files, share/capture cancellation, keyboard dialog dismissal/focus restoration, and a 390px mobile viewport.

Synthetic capture does not exercise OS pickers, actual microphone/camera hardware, mobile resource limits, or a physical perceptual audio-sync reference. Native Firefox encoding is covered separately below.

October 21 additional checks: physical Mac FaceTime HD camera plus built-in microphone capture and playback passed; test media was cleared. Firefox now passes screen-only recording, retained-output/retry flows, microphone-only capture, multiple screens, camera plus two microphones, and playback of all three combined-source files. Native desktop Safari automation was unavailable (remote automation disabled); a WebKit automation engine did not launch successfully. Physical iPhone testing is tracked separately and must not be inferred from these desktop results. Earlier phone checks found black front-camera output when both cameras were selected and unreliable native sharing/video playback outside the page. Camera policy, export format preference, and share feedback were repaired. Those earlier export reports did not identify the candidate version; the visibly labelled Release check 5 and its audio metadata are now confirmed. On the labelled candidate, the owner subsequently confirmed front-camera + microphone recording as `video/mp4`, saving video to Photos, sharing audio after video, sharing video again, the success feedback, and browser playback through Save → View. The owner also downloaded the MP4 and confirmed playback from Downloads in the browser.

October 21 extended acceptance:

- The owner reported a successful approximately three-hour audio-only recording on a physical iPhone: the recording saved locally on the phone and the saved file played successfully. The labelled Release check 5 interface and its `audio/mp4` metadata were subsequently confirmed. This is a manual endurance/export result; no phone memory measurements or full-stream decoder analysis were collected. Front-camera + microphone video, Photos saving, repeated video/audio sharing, and browser viewing also passed the owner’s later test on the labelled candidate; the owner also confirmed that the downloaded MP4 plays from Downloads in the browser.

- Chrome native tab capture through `getDisplayMedia` recorded and played to the end (4.56 seconds, 2992×1780). A further real tab + named built-in microphone + FaceTime HD camera recording produced all three files and played each to the end (about 4.8 seconds). Physical media was cleared without downloading; the captured tab contained only generated test content.
- A concurrent screen, camera, and microphone soak ran for 1,825.6 seconds using synthetic canvas/oscillator sources with native Chrome VP9/Opus encoders. All three downloads succeeded: two 200,090,111-byte videos and one 58,629,060-byte audio file. Every video and audio stream decoded fully with no warnings; browser playback from 1,818 seconds reached the end of all three files. Audio/video end timestamps differed by at most 50 ms within each video; this is a timestamp check, not a perceptual sync measurement.
- The soak reported no recording errors. Sampled JavaScript heap ranged below 16.1 MB and ended at 7.4 MB. This excludes retained Blob/native media storage: completed files totaled about 437.6 MiB, so recording memory still grows with output size. The soak page was isolated from development-server hot reload; the audio-bearing recorder path was unchanged by subsequent video-only MIME and export UI fixes.
- Updated Chrome browser checks cover a pending share, download during sharing, a stalled-share message, cancellation, sharing another file, success, and retrying the original file. Shared file MIME metadata excludes codec parameters. A simulated iPad desktop user agent with two real camera IDs confirms selecting one camera replaces the other and produces one output. The Apple mobile format path also downloaded and played MP4 video plus M4A audio; independent decoding confirmed H.264 and AAC in the MP4, and AAC in the M4A. This used Chrome encoders under a simulated mobile identity, and is supplemented by the owner’s physical iPhone export results above.

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

The fixture only accepts localhost URLs. It replaces acquisition in that isolated browser session, uses generated media, and leaves screenshots/downloads local. Do not commit those artifacts. The combination check covers camera plus two microphones, share cancellation/retries/stalls with download fallback, and cancellation before the second screen picker. Run `scripts/browser-mobile-cameras.js` last in an isolated Chrome session with MP4/AAC encoding support to check camera selection under a simulated iPad desktop browser identity; this does not emulate Safari encoding or iPhone hardware.

## Deployment acceptance

- [x] Hosted CI passes for the accepted PR and merged source (`1e0dd05`): build, 16 tests, dependency audit, and container checks. The final documentation record is checked again before publication.
- [x] Desktop Chrome: real tab + named mic + camera capture, all three files play to the end. Synthetic browser checks cover picker cancellation, retries, source termination, and retention.
- [x] Desktop Firefox: native encoder checks cover screen/mic/camera input, combined sources, playback, filenames, and Share recovery with simulated share responses.
- [x] Physical iPhone audio-only recording, local save, and saved-file playback: approximately three hours, owner reported.
- [x] iPhone Safari on Release check 5: front-camera + mic, MP4 metadata, Save Video to Photos, repeated video/audio sharing, success feedback, and Save → View browser playback.
- [x] Direct iPhone Save → Download video playback: the owner confirmed the downloaded MP4 plays from Downloads in the browser.
- [x] A 30-minute concurrent recording completes, downloads, fully decodes, and plays to the end. Memory and stream timestamps were checked as described above; perceptual hardware sync remains outside this synthetic test.
- [x] Deployed `/version.json` reports version 0.2.0 and the approved revision; `/healthz` returns `ok`. Public asset hashes match the built app, missing JavaScript returns 404, HTML/metadata revalidate, all security headers are present, HTTP upgrades to HTTPS, and directory redirects preserve HTTPS. CSP remains report-only.
- [x] The deployed app recorded a real Chrome tab + named microphone + FaceTime HD camera, and all three files played to the end. Test media was cleared without downloading. The linked GitHub release records publication of `v0.2.0`.

CSP observation: the smoke-test harness fetches its own Blob URLs to measure file sizes, producing report-only `connect-src` notices. App playback uses the separately allowed `media-src blob:` path. Enforcement remains disabled pending broader hosting/browser observation.

Coverage limits: native desktop Safari automation was unavailable. The actual browser Stop sharing control and perceptual hardware A/V sync were not independently checked; source termination and stream timestamp checks cover their narrower cases. Phone orientation changes were not separately instrumented. The confirmed phone export paths are Photos saving, repeated native sharing, browser View, and direct Download playback in the browser.

Build from the approved commit using Node 24 and `npm ci`, or build the Docker image with `--build-arg BUILD_REVISION=<approved-commit>`. CI-generated artifacts include the GitHub commit in `version.json`. The checked-in `dist` remains available for the existing static deployment path; a local build is explicitly identified as `local` unless `BUILD_REVISION` is provided.

Deployment note: the VPS Dockerfile builder does not automatically inject the Git revision. This release supplies `BUILD_REVISION` for each build, then restores the previous empty build arguments so future builds cannot inherit a stale revision. Future VPS releases must supply their approved revision again; automating that handoff remains maintenance work.

The previous production image and private service/configuration snapshot were preserved before rollout. Keep the previous static bundle or image digest before switching traffic. Roll back by redeploying that exact artifact; there is no server-side database migration. Users must save active recordings before a reload or deployment-related refresh.
