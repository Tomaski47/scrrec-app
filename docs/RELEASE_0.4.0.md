# 0.4.0 — automatic local session saving

October 24, 2026. [PR #13](https://github.com/Tomaski47/scrrec-app/pull/13) adds automatic browser-local recording and transcript recovery. This follows the v0.3.1 background-transcription release.

Refreshing or closing the tab previously discarded media and text. The recorder now saves encoded media and transcript snapshots automatically in this browser profile and restores them when reopened. The app remains frontend-only; no upload or account service is added.

## Changes

- IndexedDB stores incoming media checkpoints, finalized files and recognized transcript snapshots. A completed file replaces its checkpoints atomically. File/session UUIDs preserve association without colliding with restored sessions.
- Restore recreates local playback URLs and preserves stable/draft text, metadata, timestamps and incomplete-state notices. It does not reopen devices, load the model or restart capture.
- An interrupted capture restores only committed data and is marked partial. Its last unsaved portion can be missing; unfinished containers may not play. Restored text exports include the recovery warning.
- Compact save status reports restoring, pending writes, committed saves and quota/unavailable-storage failures. Storage failures preserve in-memory recording/export. Clear All deletes saved session data; stale tabs cannot silently recreate cleared records. Preview storage is isolated from the live library.
- Update the privacy wording, technical milestones, features, tools and stack to include the October reliability/transcription releases, background recovery and local saving. The test-only fake-indexeddb dependency adds no runtime database library.

## Validation and remaining scope

All 60 unit tests, lint, application/test types and production/experiment builds pass locally. Real-browser checks cover exact media hashes and text after refresh, actual closed-tab reopening, committed partial data after an active refresh, playback, Clear All after reload, failure feedback, continued recording/download under simulated storage failures and narrow dark/light layouts. Model and device startup remain absent during restoration.

[Storage design, evidence and reproduction](LOCAL_AUTOSAVE.md) distinguishes controlled failure injections from actual disk exhaustion. The owner tested the updated preview on a physical iPhone in Safari and reported that recordings and text remained available after app switching, screen locking and force-quitting/reopening Safari; recording and transcription also worked well in that session. This is user-reported acceptance, not an instrumented measurement of background inference timing or the exact final checkpoint. Large saved libraries, extended endurance and other mobile browsers remain unverified.

Explicit downloads remain useful backups: browser profiles/origins are separate, and storage quotas, eviction, private browsing or clearing site data can remove local copies. Catch-up transcription from saved audio, per-session deletion and bounded library/memory management remain follow-ups.

## Deployment

Deploy the merged main revision through Dokploy with its exact `BUILD_REVISION`, preserve the v0.3.1 image for rollback, then restore prior build arguments and autodeploy settings. Verify health, public version and asset hashes, real model readiness and all retired preview/test routes. Local-saving previews are retired with explicit 404 responses; their isolated browser data is not migrated into production or deleted remotely. Download anything needed from a preview before leaving it.
