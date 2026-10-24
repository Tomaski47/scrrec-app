# Automatic local session saving

October 24, 2026. Release v0.4.0 adds local persistence to the v0.3.1 background-transcription behavior.

## Behavior

Recordings and transcripts save automatically in IndexedDB in the current browser profile. Opening the app restores completed files and transcript snapshots into the existing session groups. Restore recreates playback URLs; it does not acquire devices, start recording, load a model, or resume an old recognition job. Save/Share and TXT/JSON export remain separate copies outside this library.

Native `dataavailable` chunks are checkpointed as the browser delivers them. A successful Stop stores the finalized Blob and removes redundant checkpoints in the same transaction. On an unexpected refresh or close, previously committed chunks return as a partial recording. The final unsaved interval may be missing; an unfinished MP4/container may not play without finalization. No claim is made that each encoded fragment is independently decodable or that closing a tab can finish capture reliably.

Transcript snapshots include stable paragraphs, the latest recognized draft, timestamps, model provenance, interruption notices and completion state. Restored unfinished text keeps its words and is explicitly marked incomplete, including in text copies/exports. Recognition that had not returned before closure cannot be recreated by this storage layer.

## Controls and failures

- The compact save status distinguishes restoring, saving, saved and storage failures. Saved reflects an IndexedDB transaction completing, rather than a write merely being queued.
- Clear All deletes the library's media, chunks and transcripts and unloads the active speech model. It does not remove the separately cached model download. A generation marker rejects stale writes from other tabs after clearing; those tabs retain their in-memory results for downloading and must refresh to restart automatic saving.
- Storage failures never stop MediaRecorder or silently delete prior data. The app warns the user to download files/text before leaving. Startup remains usable if IndexedDB cannot open. Foreground storage operations are bounded; browser suspension does not by itself trigger a false timeout.
- The library is device/browser/profile/origin specific. Private browsing, storage pressure, eviction and clearing site data can remove copies. Explicit downloads remain the recommended separate backup.
- Preview builds use a separate database name for each base path, so preview Clear All cannot delete the live app's library. Test and model caches are not reused as recording storage.

## Implementation

`src/storage/sessionStore.ts` owns the versioned IndexedDB schema and strict-durability write transactions, with a compatibility fallback. Recordings, encoded chunks and transcripts have distinct stores. URLs and MediaStream/AudioContext/Worker objects are never serialized. UUID file/session keys avoid collisions across restored sessions and tabs.

`src/storage/localArchive.ts` serializes writes, coalesces transcript updates and flushes recognized text at pagehide/visibility boundaries. It does not rely on unload handlers completing asynchronous work. Recorder checkpoints and finalization are independent of the optional speech engine. Completed files can replace incomplete checkpoints after a temporary write failure.

The text-draft reference is the existing Text & Speech `useDrafts`/`draftStore` implementation. Its text-only localStorage approach is adapted to asynchronous IndexedDB for binary media; no runtime database dependency is added. `fake-indexeddb` is a development-only test dependency.

[IndexedDB supports Blob storage and transaction durability](https://www.w3.org/TR/IndexedDB/). [WebKit's storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) explains quota errors and best-effort eviction. Transaction durability does not grant unlimited retention or recover audio the browser never delivered.

## Validation

All 60 unit tests pass, including exact media/transcript restoration over new DB connections, partial chunk reconstruction, finalization replacing checkpoints, stale cross-tab writes after Clear All, restored draft/incomplete exports, quota/unavailable-storage failures, and coalesced transcript clearing.

Chrome browser checks use real IndexedDB, native encoders and real Tiny/WASM recognition with localhost-only generated microphone/camera sources:

- Two completed media files restored with identical SHA-256 hashes after refresh; audio and 640 × 360 video played. The five-window, 668-character transcript exported identically. Finalization removed redundant checkpoint rows.
- Actually closing the original tab and opening a new one restored both files and text. No microphone/camera acquisition or worker/model startup occurred. Clear All stayed empty after another reload.
- Refresh during an active capture restored two partial files and recognized stable/draft text, without restarting devices. JSON/plain-text exports include the recovery warning. The recovered WebM audio played in this test; this is not proof of unfinished MP4 playback on iPhone.
- Simulated quota rejection left recording active, with playable/downloadable media and a visible storage-full warning. Simulated unavailable IndexedDB also permitted recording and playback while warning that local saving failed. These are controlled failure injections, not tests that fill the user's disk.
- Restored-session and storage-error layouts have no horizontal overflow at 390 px dark and 320 px light. Theme screenshots wait for text-color transitions to settle before assessing contrast.

Reports, generated media and screenshots are retained under `output/playwright/autosave/`, outside Git. Helpers are `scripts/browser-autosave-*.js`; generated-device setup uses `scripts/browser-recorder-transcription.js`. The interruption verification helper runs after a separate intentional reload, because the CLI can yield on an unload dialog before returning its callback result. The owner subsequently tested the updated preview on a physical iPhone in Safari and reported preserved recordings/text after app switching, screen locking and force-quitting/reopening Safari, with recording/transcription still working well. This acceptance does not measure exact background inference timing or the final committed checkpoint; other mobile browsers and extended endurance remain unverified.
