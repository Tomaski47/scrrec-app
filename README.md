# Screen Recorder

A local-first browser recorder for screen, camera, and microphone capture. The live app is available at [screc.sadilekinnovation.com](https://screc.sadilekinnovation.com/).

Screen Recorder is a Sadilek Innovation project built from a Bolt DIY start, refined through the 2025 app pass, and refreshed in 2026 with a cleaner UI and a more stable source-selection flow.

## Features

- Record one or more screen slots through the browser display picker.
- Capture camera and microphone sources as separate output files.
- Select OS default, named physical, virtual, and browser-default microphone inputs when the browser exposes them.
- Tune microphone gain with live dBFS peak metering.
- Toggle browser audio processing options: noise suppression, echo cancellation, and auto gain.
- Keep capture local to the browser session; there is no account flow and no upload pipeline.
- Save or share generated recordings from the device running the app.

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

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

The Vite config is pinned to port `5173`. The app is usually available at:

```text
http://localhost:5173/
```

Build the static bundle:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run linting:

```bash
npm run lint
```

## Deployment

The app builds to `dist/`. This repository currently tracks the generated `dist` bundle because the live deployment flow expects built static assets in the repo.

Docker deployment is also supported:

```bash
docker build -t screen-recorder .
docker run --rm -p 8080:80 screen-recorder
```

Then open:

```text
http://localhost:8080/
```

## Browser Notes

- Desktop Chromium browsers generally provide the broadest screen, camera, and microphone support.
- Screen capture is not available on many mobile browsers.
- Mobile front/rear camera behavior depends on whether the browser exposes stable camera device IDs.
- Apple Continuity and iPhone microphones are browser/OS-dependent. See [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md).

## Project Docs

- [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md)
- [Open Source Release Checklist](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Released under the [MIT License](LICENSE).
