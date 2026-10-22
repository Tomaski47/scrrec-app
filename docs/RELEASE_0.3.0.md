# 0.3.0 — local transcription

October 22, 2026. Adds English transcription to the recorder with no fixed live transcription duration cutoff. [PR #10](https://github.com/Tomaski47/scrrec-app/pull/10) contains the feature and release cleanup.

## Changes

- Enable Local transcription to prepare Whisper Tiny English automatically. Model load/unload/remove controls remain available while unchecked. Starting without a ready model or selected microphone requires an explicit choice before capture.
- Local recognition uses the selected microphone streams. Transcription failures, cancellation and bounded-queue overload do not stop media recording. Overlapping windows and timed reconciliation preserve phrase boundaries; stable text is archived into paragraphs while the revisable tail remains bounded.
- Each capture has an associated transcript with copy/TXT/JSON export and incomplete/finished status. Earlier media and text collapse into Previous sessions without being deleted. Sharing stays coordinated across current and prior sessions.
- Compact source controls, clear model status, linked model details and inline open-source notices. The model is Xenova/whisper-tiny.en; Transformers.js 4.3.0, its runtime and model revisions are pinned.
- Production retires temporary recorder/transcription previews, release checks, experiment routes and Whisper test URLs with 404 responses. The research lab and source tests remain available for development, excluded from the production site.
- Existing screen/camera/microphone audio routing is unchanged. Direct tab/system-audio capture remains separate follow-up work.

## Validation and limits

38 automated tests cover recorder lifecycles, camera rules, phrase boundaries, three hours of synthetic timed words, model/session routing, cancellation, failure and overload. Hosted checks run lint, types, production/experiment builds, dependency audit and a container smoke test, including retired URL checks.

The real-engine 30:05 generated screen/camera/microphone run retained all 5,822 normalized words across 142 complete reference repetitions; the cut final phrase is separately reported. All three media files played and fully decoded. This is a generated-reference result, not a general human-speech accuracy estimate. Final short real-model/cancellation checks retained six playable files and correctly associated transcripts.

Browser checks cover automatic preparation, explicit fallback, model management while unchecked, retained downloads, cross-session sharing, cache deletion, inline licenses and retry. Layout checks at desktop, 390 px and 320 px verify matching source spacing, button height and indentation with no overlapping header text.

Saved media and completed transcript text still grow in tab memory; there is no unlimited-storage promise. iPhone/iPad app switching and screen locking may interrupt audio processing. The owner-confirmed 40-second iPhone transcription result used Preview 2; the newer engine and longer integrated phone endurance are not claimed as physically validated. Further manual phone tests remain deferred at the owner's preference.

Long imported files, broader human/noise comparisons, background-interruption recovery, offline startup and durable recording recovery remain follow-ups. See [integration evidence](experiments/LOCAL_TRANSCRIPTION_04.md) and the [roadmap](LOCAL_TRANSCRIPTION_ROADMAP.md).

## Deployment

Deploy the merged main revision through Dokploy with BUILD_REVISION set to that exact commit, then restore the previous build arguments so a later deployment cannot inherit a stale revision. Preserve the prior production image for rollback. Verify health/version metadata, public asset hashes, model readiness and inline license loading, and 404 responses for retired test URLs. A new production container excludes the temporary copied preview directories.
