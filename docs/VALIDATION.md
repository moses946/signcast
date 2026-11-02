# Validation ledger

Date: 2 November 2026. Never treat fixture checks as proof of live ASL or native Twitch playback.

## Completed

- Root typecheck and production builds pass.
- 22 unit/integration tests pass: resampling, phrase finalization/deduplication, overload and failure behavior, retention, authorization, AWS result mapping/audio backpressure, and one render shared with ten HTTP readers.
- Three Chromium browser tests pass: independent personal replay/hiding; dashboard keyboard/input-scope check; actual AudioWorklet/PCM capture from a synthetic browser microphone with pause cleanup.
- Dependency update removed Google packages and reported zero npm vulnerabilities.
- Isolated Git repository initialized. Heuristic source/build/history secret scan passes; ignored `.env` contains only owner-supplied local settings and is not tracked.

## Live findings

- Custom-domain unauthenticated health returned HTTP 525.
- Owner-supplied Cloud Run origin returned HTTP 503 for unauthenticated health and authenticated `/v1/me`.
- The provider-check script did **not** start a paid render because account preflight failed.
- AWS CLI sign-in completed in the independent `signcast` profile. Runtime provisioning/live transcription results are recorded in the ignored `artifacts/` directory and handoff when available.

## Pending gates

- Signvrse account endpoint and render recover; first-fragment/total timing measured from real output.
- Ten representative ASL phrases reviewed by an ASL-fluent reviewer. Statements, negation, question, number, proper name, fingerspelling, and longer phrase included.
- AWS Transcribe live authorization and speech accuracy verified in the owner’s account.
- Twelve-minute live speech session and one-hour/300-render limits exercised with actual service conditions.
- User-created Twitch OAuth app and Extension credentials configured.
- Actual Twitch Local/Hosted Test: Helper JWT, CSP/CORS, component dimensions, mute/autoplay, MSE/complete-MP4 fallback, two allowed viewer accounts, timing, hidden/paused lifecycle, refreshed authorization.
- Actual OBS Browser Source playback of live ASL.
- Hosted deployment and production AWS credential strategy.

## Performance targets, not achieved claims

Warm short phrase: median final-text-to-first-frame at most five seconds; paced three-minute sample with no dropped signing; cached replay starts within one second at a safe boundary. Measure speech-end-to-display separately from render timing. A fast renderer does not imply signing duration can keep up with speech.

## ASL evaluation phrases

1. Hello. Welcome to the stream.
2. Thank you for watching.
3. We are starting a new game.
4. I do not understand.
5. Are you ready?
6. Please wait one minute.
7. There are three players.
8. My name is Alex.
9. The next round starts soon.
10. You can replay the last phrase.

Use the hosted API with explicit `signLanguage=asl`. API acceptance and recognizable fingerspelling are not enough to claim full ASL interpretation quality.
