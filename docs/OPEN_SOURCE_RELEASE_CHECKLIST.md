# Open Source Release Checklist

Use this checklist before marking the project ready for a public open-source release.

## Repo Basics

- [x] Add MIT license.
- [x] Add README with setup, privacy model, browser notes, and deployment notes.
- [x] Add contributing guide.
- [x] Add security policy.
- [x] Ignore macOS Finder metadata.
- [x] Update package metadata away from the Vite starter defaults.

## Source Review

- [x] Confirm no secrets, tokens, private URLs, or local-only credentials are committed.
- [x] Confirm no generated recordings or personal media files are committed.
- [x] Confirm browser device IDs are not logged or displayed in full.
- [x] Confirm package dependencies and lockfile are intentional.
- [x] Confirm `dist` should remain tracked for the deployment flow.

## Functional Smoke Test

- [ ] Run `npm install` from a clean checkout.
- [x] Run `npm run build`.
- [x] Run `npm run lint`.
- [ ] Test desktop screen recording.
- [ ] Test desktop microphone recording with the system default mic.
- [ ] Test named microphone selection when available.
- [ ] Test camera recording.
- [ ] Test mobile camera and microphone fallback behavior.

## GitHub Release Prep

- [ ] Verify repository description and homepage.
- [ ] Add topics such as `screen-recorder`, `react`, `vite`, `mediarecorder`, `browser`.
- [ ] Enable GitHub vulnerability reporting if available.
- [ ] Decide whether to use GitHub Issues, Discussions, or both.
- [ ] Add a first public release tag after the smoke test passes.
