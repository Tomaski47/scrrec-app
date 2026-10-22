# Screen Recorder

A local-first browser recorder for screen, camera, and microphone capture. The live app is available at [screc.sadilekinnovation.com](https://screc.sadilekinnovation.com/). See [v0.2.0](https://github.com/Tomaski47/scrrec-app/releases/tag/v0.2.0) for the reliability release and verification notes.

Screen Recorder is a Sadilek Innovation project built from a Bolt DIY start, refined through the 2025 app pass, and refreshed in 2026 with a cleaner UI and a more stable source-selection flow.

## Features

- Record one or more screen slots through the browser display picker.
- Capture camera and microphone sources as separate output files.
- Select OS default, named physical, virtual, and browser-default microphone inputs when the browser exposes them.
- Tune microphone gain with live dBFS peak metering.
- Toggle browser audio processing options: noise suppression, echo cancellation, and auto gain.
- Keep capture local to the browser session; there is no account flow and no upload pipeline.
- Keep completed recordings available across subsequent recording attempts until explicitly cleared or the tab closes.
- Save or share generated recordings using the format actually produced by the browser.
- Mix selected microphones into each video while retaining separate microphone files. System/tab audio is not captured.

## Privacy Model

This is a frontend-only browser app. Recording streams are requested through browser APIs, generated files stay in the local browser session, and recordings are saved or shared only when the user chooses.

Browser and operating-system permissions still matter. The app can only use screen, camera, and microphone devices that the browser exposes through `getDisplayMedia`, `getUserMedia`, and `enumerateDevices`.

## Tech Stack

- React 18
- TypeScript
- Vite 6
- Browser MediaDevices and MediaRecorder APIs
- Web Audio API for microphone gain and metering
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

See [Release 0.2.0](docs/RELEASE_0.2.0.md) for browser checks and the deployment checklist.

## Deployment

The app builds to `dist/`. This repository currently tracks the generated `dist` bundle because the live deployment flow expects built static assets in the repo.

Docker deployment is also supported:

```bash
docker build --build-arg BUILD_REVISION="$(git rev-parse HEAD)" -t screen-recorder .
docker run --rm -p 8080:80 screen-recorder
```

The image includes `/healthz` and `/version.json` endpoints. HTML and release metadata revalidate; fingerprinted assets receive long cache lifetimes. Security headers include a report-only CSP pending production validation.

Then open:

```text
http://localhost:8080/
```

## Browser Notes

- Desktop Chromium browsers generally provide the broadest screen, camera, and microphone support.
- Screen capture is not available on many mobile browsers, but the app does not block by viewport size. If a browser exposes `getDisplayMedia`, the screen picker can be tried.
- Mobile front/rear camera behavior depends on whether the browser exposes stable camera device IDs.
- Apple Continuity and iPhone microphones are browser/OS-dependent. See [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md).

## Project Docs

- [Release 0.2.0](docs/RELEASE_0.2.0.md)
- [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md)
- [Local Transcription and Live Assistance Roadmap](docs/LOCAL_TRANSCRIPTION_ROADMAP.md)
- [Open Source Release Checklist](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Released under the [MIT License](LICENSE).
