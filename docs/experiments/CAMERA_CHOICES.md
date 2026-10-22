# Camera choices after the reliability release

October 21, 2026.

Safari on the tested iPhone 14 Pro lists one front camera and six rear choices. Three rear entries are physical lenses; three are virtual combinations. A combined mode supplies one video stream, not a separate recording from each constituent lens. Browser/device behavior controls switching; the app does not promise a particular zoom ratio or native Camera-app switching behavior.

| Native English name | Description added beneath it |
|---|---|
| Front Camera | Selfie camera |
| Back Camera | Standard rear wide lens |
| Back Ultra Wide Camera | Rear ultra-wide lens · widest view |
| Back Telephoto Camera | Rear telephoto lens · closer view |
| Back Dual Camera | Combined rear wide + telephoto mode |
| Back Dual Wide Camera | Combined rear ultra-wide + wide mode |
| Back Triple Camera | Combined rear ultra-wide + wide + telephoto mode |

Keep the actual browser label. Add descriptions only for recognized English names rather than guessing from device order, hashed IDs, or localized labels. [WebKit's virtual-camera discussion](https://bugs.webkit.org/show_bug.cgi?id=253186) identifies the standard Back Camera and explains the extra virtual entries and localized labels. Apple's definitions confirm [Dual](https://developer.apple.com/documentation/avfoundation/avcapturedevice/devicetype-swift.struct/builtindualcamera), [Dual Wide](https://developer.apple.com/documentation/avfoundation/avcapturedevice/devicetype-swift.struct/builtindualwidecamera), and [Triple](https://developer.apple.com/documentation/avfoundation/avcapturedevice/devicetype-swift.struct/builtintriplecamera) lens combinations.

## Simultaneous recording

The shipped one-camera guard was introduced after the physical phone produced black front-camera video when front and rear were selected together. Front-only recording subsequently passed playback, Photos sharing, repeated sharing, and downloaded MP4 playback. The guard is an app rule reflecting the observed failure; enumeration alone does not establish concurrency support.

WebKit's dedicated [multiple-camera issue](https://bugs.webkit.org/show_bug.cgi?id=238492) remains open when checked for this pass. The earlier [capture issue, comment 30](https://bugs.webkit.org/show_bug.cgi?id=179363#c30), distinguishes parallel captures of the same camera from captures of different physical cameras: its fix did not add front-and-back concurrency. There is no evidence here that current iPhone Safari can reliably record both physical cameras through this app. Native iOS camera capabilities should not be assumed to be available through the browser.

Use radio buttons for the existing exclusive choices on iPhone/iPad and generic front/back fallback devices. The top-level Camera checkbox turns camera capture off. Keep checkboxes for real device IDs on desktop and other browsers where the app already permits multiple cameras; actual combinations remain hardware/browser dependent. This pass does not relax the recording guard or add any new camera acquisition.

The existing synthetic iPad-desktop-UA browser fixture passed radio exclusivity, one-camera output, MP4/M4A downloads and playback. It verifies the UI and encoding path in Chrome with generated tracks, not physical Safari concurrency. If WebKit gains this capability, revisit the guard with two distinct, visibly moving live previews and recorded playback on the target phone before enabling it.
