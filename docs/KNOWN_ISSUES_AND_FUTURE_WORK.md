# Known Issues and Future Work

Last updated: June 10, 2026

## Locked Baseline

- Screen capture supports one or more screen slots, with each slot using the browser display picker and saving as a separate recording.
- Desktop microphone capture supports the OS default input, named physical inputs, gain, input metering, echo cancellation, noise suppression, and auto gain controls.
- Camera capture supports browser-exposed camera devices, with mobile front/rear fallback behavior kept to one active camera at a time when the browser does not expose separate stable device IDs.

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
