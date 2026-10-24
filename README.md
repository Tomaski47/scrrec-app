# Screen Recorder

A local-first browser recorder for screen, camera, and microphone capture. The live app is available at [screc.sadilekinnovation.com](https://screc.sadilekinnovation.com/). See [Release 0.4.0](docs/RELEASE_0.4.0.md) for automatic local saving, [Release 0.3.1](docs/RELEASE_0.3.1.md) for background transcription and interruption recovery, and [Release 0.3.0](docs/RELEASE_0.3.0.md) for the original transcription integration. The earlier [v0.2.0](https://github.com/Tomaski47/scrrec-app/releases/tag/v0.2.0) contains the reliability release.

Screen Recorder is a Sadilek Innovation project built from a Bolt DIY start, refined through the 2025 app pass, and refreshed in 2026 with a cleaner UI and a more stable source-selection flow.

v0.4.0 adds [automatic local session saving](docs/LOCAL_AUTOSAVE.md): recordings and transcripts restore in the same browser after refresh or reopening. The owner confirmed recovery after switching apps, locking the phone and force-quitting/reopening Safari on an iPhone.

## Features

- Record one or more screen slots through the browser display picker.
- Capture camera and microphone sources as separate output files.
- Select OS default, named physical, virtual, and browser-default microphone inputs when the browser exposes them.
- Tune microphone gain with live dBFS peak metering.
- Toggle browser audio processing options: noise suppression, echo cancellation, and auto gain.
- Keep capture local to the device; there is no account flow and no upload pipeline.
- Automatically save recordings and transcripts in this browser and restore them after refresh or reopening.
- Checkpoint incoming media chunks; recover an interrupted recording as partial, with explicit completeness/playback warnings.
- Transcribe selected microphones locally with Whisper Tiny English, timestamped paragraphs and TXT/JSON exports.
- Keep microphone transcription eligible for background processing and recover temporary audio interruptions; the owner confirmed app-switch and screen-lock coverage in iPhone Safari.
- Save or share generated recordings using the format actually produced by the browser.
- Mix selected microphones into each video while retaining separate microphone files. System/tab audio is not captured.

## Privacy Model

This is a frontend-only browser app. Recording streams are requested through browser APIs; media and transcript snapshots are saved automatically in this device's browser profile using IndexedDB. They are not uploaded for storage or recognition. Save/Share and transcript exports create separate copies at the user's request. Clear All deletes local session data; model downloads have separate Remove model controls.

Browser quotas, private browsing, clearing site data and eviction can affect retention. Storage failures are reported without stopping recording. Closing during a capture can leave only earlier committed chunks; recovered media may be incomplete or unplayable. Restore does not reacquire devices or restart capture. See [storage behavior and limits](docs/LOCAL_AUTOSAVE.md).

Browser and operating-system permissions still matter. The app can only use screen, camera, and microphone devices that the browser exposes through `getDisplayMedia`, `getUserMedia`, and `enumerateDevices`.

## Tech Stack

- React 18
- TypeScript
- Vite 6
- Browser MediaDevices and MediaRecorder APIs
- Web Audio API for microphone gain and metering
- AudioWorklet, a dedicated speech worker, Transformers.js 4.3.0 and ONNX Runtime Web for on-device Whisper Tiny English
- IndexedDB for encoded media, transcript snapshots and local recovery
- Node 24 tests and fake-indexeddb for storage regressions; Playwright for real-browser recording and restore checks
- GitHub Actions for source, build, dependency-audit and container checks; Dokploy for deployment
- Docker and nginx for static deployment

## Getting Started

Use Node.js 24 LTS (`nvm use` reads `.nvmrc`), then install the locked dependencies:

```bash
npm ci
```

Run the local dev server:

```bash
npm run dev
```

The Vite config currently defaults to port `5174` for local development. The app is usually available at:

```text
http://localhost:5174/
```

For a strict local-only server on that port, use:

```bash
npm run dev:5174
```

You can also override the port for ad-hoc testing, for example:

```bash
npx vite --port 5175
```

Build the static bundle:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run linting, the recorder lifecycle regression tests, type checking, and a production build:

```bash
npm run check
```

See [Release 0.4.0](docs/RELEASE_0.4.0.md) for the current release and [Release 0.2.0](docs/RELEASE_0.2.0.md) for the earlier reliability checks.

The main recorder includes English local transcription. Select Mic, enable Local transcription, and wait for Local model: loaded before recording. Expand the arrow beside Local transcription to manage the model, including while the checkbox is off. Enabling the option automatically prepares the model; the speech engine downloads nothing until you enable transcription or explicitly choose Load model. If it is not ready, Start Recording asks you to wait, retry, or explicitly record without transcription. Tiny runs on the device using the selected microphone streams; transcription errors or cancellation do not stop recording. Each recording session has a transcript with copy, TXT and JSON export. Starting another recording collapses earlier results into Previous sessions without deleting them; use Clear All to remove them explicitly.

Live transcription has no fixed time cutoff. PCM, queued jobs and the revisable text remain bounded; retained transcript text and encoded recordings still consume memory and local disk space. Automatic saving does not grant unlimited storage or guarantee the final unsaved interval after an abrupt closure. iPhone/iPad app switching or screen locking can interrupt processing; v0.3.1 preserves the tap, attempts recovery and marks possible gaps. The owner confirmed audio and transcript coverage through both background intervals in Safari. Longer phone endurance and iPhone Chrome/Brave remain unverified. See [recovery evidence](docs/experiments/TRANSCRIPTION_INTERRUPTION_RECOVERY.md).

The separate research lab remains at `/experiments/transcription.html` during development. `npm run build:experiments` builds it in `output/transcription-lab/`; the normal build includes the recorder feature but excludes the lab page. Lab file import remains limited to 20 MB / 60 seconds; long-file recovery needs incremental decoding.

## Deployment

The app builds to `dist/`. This repository currently tracks the generated `dist` bundle because the live deployment flow expects built static assets in the repo.

Docker deployment is also supported:

```bash
docker build --build-arg BUILD_REVISION="$(git rev-parse HEAD)" -t screen-recorder .
docker run --rm -p 8080:80 screen-recorder
```

Production excludes the research lab and retires temporary `/recorder-preview/`, `/transcription-preview/`, `/release-check/`, `/experiments/`, recovery previews A/B, local-saving review previews and Whisper test URLs with 404 responses. New preview builds isolate their saved-session database by base path so their Clear All cannot delete live session data.

The image includes `/healthz` and `/version.json` endpoints. HTML and release metadata revalidate; fingerprinted assets receive long cache lifetimes. Security headers include a report-only CSP pending production validation.

Then open:

```text
http://localhost:8080/
```

## Browser Notes

- Desktop Chromium browsers generally provide the broadest screen, camera, and microphone support.
- Screen capture is not available on many mobile browsers, but the app does not block by viewport size. If a browser exposes `getDisplayMedia`, the screen picker can be tried.
- iPhone/iPad camera choices are exclusive; desktop supports multiple camera selections when the hardware/browser permits it. See [camera names and simultaneous capture](docs/experiments/CAMERA_CHOICES.md).
- Apple Continuity and iPhone microphones are browser/OS-dependent. See [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md).

## Project Docs

- [Release 0.4.0](docs/RELEASE_0.4.0.md)
- [Automatic local saving and recovery](docs/LOCAL_AUTOSAVE.md)
- [Release 0.3.1](docs/RELEASE_0.3.1.md)
- [Release 0.3.0](docs/RELEASE_0.3.0.md)
- [Release 0.2.0](docs/RELEASE_0.2.0.md)
- [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md)
- [Local Transcription and Live Assistance Roadmap](docs/LOCAL_TRANSCRIPTION_ROADMAP.md)
- [Transcription Experiment 01: implementation and measurements](docs/experiments/LOCAL_TRANSCRIPTION_01.md)
- [Camera Choices](docs/experiments/CAMERA_CHOICES.md)
- [Open Source Release Checklist](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Released under the [MIT License](LICENSE).
