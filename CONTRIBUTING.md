# Contributing

Thanks for helping improve Screen Recorder.

## Local Setup

```bash
npm install
npm run dev
```

The local app currently runs on port `5174` by default. Use `npm run dev:5174` for the strict local server script, or pass a Vite `--port` override for ad-hoc testing.

## Development Guidelines

- Keep the app local-first. Do not add upload, account, analytics, or remote storage behavior without an explicit product decision.
- Treat media device IDs as sensitive implementation details. Do not log full `deviceId` or `groupId` values in production UI.
- Preserve the stable mic flow: OS default, exact named inputs, and browser-default fallback should stay distinct.
- Re-test screen, mic, and camera basics after changing capture logic.
- Keep mobile camera fallbacks conservative unless browser support for simultaneous streams is verified.

## Before Opening a Pull Request

Run:

```bash
npm run build
npm run lint
```

If app source changes affect the shipped UI, rebuild and include the updated `dist` assets because this repo currently tracks the static bundle for deployment.

## Documentation

When a browser limitation or product decision is discovered, update [Known Issues and Future Work](docs/KNOWN_ISSUES_AND_FUTURE_WORK.md) so the project history stays useful.
