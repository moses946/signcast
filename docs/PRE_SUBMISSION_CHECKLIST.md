# Pre-submission verification — 2 November 2026

Deadline: 2 November 2026, 14:00 PST = 3 November 2026, 01:00 Africa/Nairobi.
Source: https://twitchcon-codex.devpost.com/rules

## Passed in the latest verification

- TypeScript checking and production builds.
- All 27 unit/integration checks: authentication boundaries, channel isolation, segmentation, queue limits, resampling, retained media, one render shared by ten HTTP readers, and replay reuse.
- All four Chromium checks: two independent players' replay/hide controls; complete-MP4 playback without MediaSource; basic keyboard/input-scope checks; synthetic microphone AudioWorklet capture and pause cleanup.
- Extension ZIP rebuilt with root viewer.html, config.html, live.html entrypoints.
- Heuristic secret scan of source, built bundles, and available Git history.
- Live AWS health; OAuth redirect/client/callback matching; diagnostic extension signing-secret exchange; allowed extension-origin CORS; absence of demo authentication in live mode.
- Earlier real Amazon Transcribe smoke check on the same implementation returned three final and seven interim segments. This is not a long-session or accuracy evaluation.

The first sandboxed integration attempt could not connect to temporary local ports (EACCES). The rerun with local socket access passed all 27 checks. No product fix was needed.

## Try locally without Signvrse

Open http://localhost:3000 while the local demo process is running. Choose **Try configured demo mode**, then **Start without a microphone** and **Send fixture phrase**. Open the demo player in two tabs, authorize both, and compare replay, hide/show, timing, and return-to-live. The fixture is a synthetic test pattern, not ASL.

Use **Start interpretation** to exercise actual microphone capture against the demo speech provider. Speak, then pause and stop; confirm the browser releases the microphone. Demo transcripts do not establish speech recognition accuracy.

Copy the local dashboard's private OBS fallback URL into an OBS Browser Source at 640×480. Use a fixture phrase to check actual OBS playback and transparency. Do not publish the URL fragment token. Browser-based overlay checks passed; actual OBS has not been verified.

## Still required before describing the project as working end to end

- Actual broadcaster Twitch OAuth sign-in and callback (automated checks validate configuration, not a human authorization flow).
- Native Twitch Hosted Test: install/activate, authentic Helper JWT, real CSP/media fetch, component size, two allowed viewer accounts, hide/replay independence, and viewer timing. The current browser automation could not target the existing console window; these checks remain unverified.
- Actual OBS Browser Source check.
- When Signvrse recovers: run `npm run check:providers -- --render` once. This can incur a rendering charge. Inspect the output and obtain ASL-fluent review; API success does not prove language quality.
- Speak new phrases through the hosted app and verify real microphone → Transcribe → shared ASL render → Twitch/OBS playback. Check two real viewers and no extra render on replay.
- Longer transcription rotation/recovery and capacity/performance evidence remain unverified. Do not claim these targets as achieved.
- Record the project functioning on Twitch in an under-three-minute public YouTube video, include Codex build evidence, prepare the description/repository link/session ID and judge access instructions, and submit before the deadline.

Signvrse's latest account/health checks returned Google Frontend HTTP 503. Cloud billing is enabled and the service's minimum instance count is one; payment as the underlying cause is unconfirmed. Log access was denied to the signed-in account. Keep this external blocker distinct from tests that passed with fixtures.
