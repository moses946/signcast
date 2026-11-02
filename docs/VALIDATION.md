# Validation ledger

Date: 2 November 2026. Never treat fixture checks as proof of live ASL or native Twitch playback.

## Completed

- Root typecheck and production builds pass.
- 27 unit/integration tests pass on Node 24: resampling, phrase finalization/deduplication, overload and failure behavior, retention, authorization, AWS result mapping/audio backpressure, and one render shared with ten HTTP readers.
- Four Chromium browser tests pass on Node 24 (including complete-file playback without MSE): independent personal replay/hiding; dashboard keyboard/input-scope check; actual AudioWorklet/PCM capture from a synthetic browser microphone with pause cleanup.
- Dependency update removed Google packages and reported zero npm vulnerabilities.
- Isolated Git repository initialized. Heuristic source/build/history secret scan passes; ignored `.env` contains only owner-supplied local settings and is not tracked.

## Hosted evidence

ECS Express Mode is serving the labeled demo over HTTPS. The deployed image built from 4b68ec1 passed ECR basic scanning with no reported findings. Real hosted browser smoke tests passed health, demo authorization, shared clip playback, and independent personal replay. One task remains after a completed rollout. This is standalone hosted-fixture evidence, not native Twitch or ASL validation.

## Live findings

- Custom-domain unauthenticated health returned HTTP 525.
- Owner-supplied Cloud Run origin returned HTTP 503 for unauthenticated health and authenticated `/v1/me`.
- The provider-check script did **not** start a paid render because account preflight failed.
- Independent IAM sign-in and restricted runtime-role assumption passed. Real Amazon Transcribe Streaming returned three final and seven interim segments from generated speech. The initial public GitHub Actions run also passed on Linux/Node 24.

## Pending gates

- Signvrse account endpoint and render recover; first-fragment/total timing measured from real output.
- Ten representative ASL phrases reviewed by an ASL-fluent reviewer. Statements, negation, question, number, proper name, fingerspelling, and longer phrase included.
- Longer and varied speech-accuracy checks; the short real generated-speech smoke test passed.
- Twelve-minute live speech session and one-hour/300-render limits exercised with actual service conditions.
- Actual user sign-in and Twitch Helper playback with the now-configured OAuth app and Extension credentials.
- Actual Twitch Local/Hosted Test: Helper JWT, CSP/CORS, component dimensions, mute/autoplay, MSE/complete-MP4 fallback, two allowed viewer accounts, timing, hidden/paused lifecycle, refreshed authorization.
- Actual OBS Browser Source playback of live ASL.
- Native/live provider verification in the hosted task; HTTPS demo hosting and workload-role strategy are implemented.

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

## Live configuration update

The AWS rollout to live provider mode completed with one task on 2 November 2026. Twitch accepted the OAuth credentials. Hosted checks passed live health, OAuth Client ID and callback matching, server-signed diagnostic extension JWT exchange, configured-origin CORS, and absent demo authentication. Actual Twitch login/Helper playback remains a separate gate. The subsequent Signvrse account preflight still returned HTTP 503, so interpretation is blocked. No paid render was attempted.
