# 0.4.0 candidate — automatic local session saving

October 24, 2026. Implemented for review; production remains v0.3.1 until this candidate is merged and deployed.

Refreshing or closing the tab previously discarded media and text. The recorder now saves encoded media and transcript snapshots automatically in this browser profile and restores them when reopened. The app remains frontend-only; no upload or account service is added.

## Changes

- IndexedDB stores incoming media checkpoints, finalized files and recognized transcript snapshots. A completed file replaces its checkpoints atomically. File/session UUIDs preserve association without colliding with restored sessions.
- Restore recreates local playback URLs and preserves stable/draft text, metadata, timestamps and incomplete-state notices. It does not reopen devices, load the model or restart capture.
- An interrupted capture restores only committed data and is marked partial. Its last unsaved portion can be missing; unfinished containers may not play. Restored text exports include the recovery warning.
- Compact save status reports restoring, pending writes, committed saves and quota/unavailable-storage failures. Storage failures preserve in-memory recording/export. Clear All deletes saved session data; stale tabs cannot silently recreate cleared records. Preview storage is isolated from the live library.
- Update the privacy wording, technical milestones, features, tools and stack to include the October reliability/transcription releases, background recovery and local saving. The test-only fake-indexeddb dependency adds no runtime database library.

## Validation and remaining scope

All 60 unit tests, lint, application/test types and production/experiment builds pass locally. Real-browser checks cover exact media hashes and text after refresh, actual closed-tab reopening, committed partial data after an active refresh, playback, Clear All after reload, failure feedback, continued recording/download under simulated storage failures and narrow dark/light layouts. Model and device startup remain absent during restoration.

[Storage design, evidence and reproduction](LOCAL_AUTOSAVE.md) distinguishes controlled failure injections from actual disk exhaustion. Physical-iPhone persistence, large saved libraries and extended endurance remain unverified. The already deployed v0.3.1 Safari background audio/transcript pass is separate from this new storage behavior.

Explicit downloads remain useful backups: browser profiles/origins are separate, and storage quotas, eviction, private browsing or clearing site data can remove local copies. Catch-up transcription from saved audio, per-session deletion and bounded library/memory management remain follow-ups.
