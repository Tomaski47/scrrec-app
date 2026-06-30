# Known Issues and Future Work

Last updated: June 30, 2026

## Locked Baseline

- Screen capture supports one or more screen slots, with each slot using the browser display picker and saving as a separate recording when the browser exposes `getDisplayMedia`.
- Desktop microphone capture supports the OS default input, named physical inputs, gain, input metering, echo cancellation, noise suppression, and auto gain controls.
- Camera capture supports browser-exposed camera devices, with mobile front/rear fallback behavior kept to one active camera at a time when the browser does not expose separate stable device IDs.

## Implementation Notes

### Media Device Normalization

The June 2026 functional pass found that copying `MediaDeviceInfo` objects with object spread can drop important browser-provided fields such as `deviceId`, `kind`, and `groupId`. Those fields are not guaranteed to behave like normal enumerable object properties in every browser. The app now uses explicit field copying when normalizing media devices so labels can be improved without losing the stable IDs needed for exact mic and camera selection.

### Microphone Selection

The stable microphone flow separates three concepts that should not be collapsed together:

- OS/system default input.
- Named physical or virtual inputs with real browser `deviceId` values.
- Browser-default fallback input for cases where the browser can open audio but does not expose a stable per-device ID.

This is why the app keeps `Refresh mics` as a quiet enumeration action and `Scan inputs` as an optional stronger probe that briefly opens mic access. Exact device IDs remain the preferred path. Browser-default fallback stays available, but it should not be used to pretend that multiple unresolved devices are individually selectable.

### Screen and Camera Decisions

Browsers do not enumerate screens the same way they enumerate cameras and microphones. The app uses screen slots instead: each selected slot opens the browser display picker, and each chosen display records as a separate file. Screen capture is capability-based rather than viewport-based: mobile-sized layouts still show the screen controls if the browser exposes `getDisplayMedia`, but many actual mobile browsers do not expose that API. For mobile cameras, front/rear fallback labels are kept single-choice when the browser does not expose stable IDs, because simultaneous front/rear mobile capture is not reliable in current browser behavior.

## Future Work

### Apple Continuity and iPhone Microphones

During the June 2026 functional pass, Chrome/macOS temporarily exposed iPhone Continuity microphones as audio input rows, and those devices could visibly ping when the browser opened audio access. We were not able to keep those devices reliably exposed as stable, selectable `deviceId` values while also preserving the working desktop mic flow.

Current behavior keeps the stable path first:

- Exact browser-exposed mic IDs are selectable.
- The OS/browser default mic is selectable.
- `Scan inputs` can briefly reopen microphone access to see whether Continuity, USB, or phone inputs become available.
- Devices that appear without a selectable browser ID should not be treated as exact inputs.

The likely future direction is to investigate whether macOS Continuity devices can be made consistently available through browser settings, OS input selection, Chrome flags, or a native wrapper. If they only appear through the OS default input, the browser app can use them through `Browser default microphone` but cannot reliably target them as independent mic sources.

### Multi-Camera Mobile Capture

iPhone Safari/Chrome may expose front and rear camera choices, but mobile browsers often allow only one active camera stream at a time. The current app keeps front/rear fallback cameras mutually exclusive on mobile. Future work can revisit simultaneous front/rear capture if browser support improves or if this becomes a native-app feature.

### Recording Flow Polish

- Confirm combined multi-source recordings across desktop Chrome, Safari, and mobile Safari.
- Add clearer success states after each file is generated.
- Consider a lightweight diagnostics drawer that reports which media devices the browser currently exposes, without logging full device IDs.
