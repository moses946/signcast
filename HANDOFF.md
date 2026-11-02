# SignCast handoff

## Latest owner instructions

- Build the native desktop Component Extension with OBS fallback and personal viewer replay.
- **Amazon Transcribe Streaming replaces Google STT.** Use the owner’s independent AWS account/credits.
- Do not reuse Signvrse Google service accounts, backend services, private libraries, or existing project keys. Only the separately supplied Signvrse enterprise API is permitted.
- The supplied key/base URL are stored only in ignored local `.env`; never repeat or commit the key.
- The owner will register the Twitch OAuth app and native Extension.

## Implemented

Standalone npm-workspace repository: companion dashboard/microphone capture, native viewer/config/live entrypoints, server, shared media player/contracts/resampler, provider adapters, queue/overload control, bounded clip cache, personal replay/timing, OBS fallback, auth boundaries, packaging, local HTTPS for extension testing, CI, docs, and synthetic fixture.

Actual data path: microphone PCM -> server -> Amazon Transcribe Streaming -> finalized English phrases -> one shared Signvrse render per phrase -> retained fMP4 -> individual authorized viewer fetch/playback. Replay reuses bytes, never rerenders. Synthetic demo mode is visibly labeled and uses no provider requests.

## AWS provisioning

Created `SignCastTranscribeRuntime` with only `transcribe:StartStreamTranscription`, region-restricted to `eu-west-1`; IAM Access Analyzer reported no findings. Root cannot assume roles, so a dedicated `SignCastDeveloper` IAM user was created with local-development sign-in, own password-change, and permission to assume only that runtime role. No permanent access keys were created.

Short-lived CLI login profile: `signcast-developer`. Application role profile: `signcast-runtime`. Root provisioning profile is not used by the application. IAM login and restricted runtime role assumption completed successfully. A real Amazon Transcribe stream returned three final and seven interim segments from generated speech. Local account/resource details and one-time password are under ignored `artifacts/`; do not publish them. Production must use an independently scoped workload identity or an explicit credential-refresh strategy. Local AWS login caches cannot be copied to Render.

The deterministic IAM generator did not recognize Transcribe Streaming. Its incomplete STS-only output was not deployed. The effective policy follows the official AWS HTTP/2 streaming permission and was separately validated.

## Verified locally

- Typecheck and production build pass.
- 27 unit/integration tests pass on Node 24.
- Four Chromium tests pass on Node 24 (including complete-file fallback): independent multi-viewer replay/hide, basic keyboard/input scope, synthetic AudioWorklet capture/cleanup.
- Local extension HTTPS server starts at `https://localhost:5174/`.
- Extension ZIP generation succeeds with root viewer/config/live entrypoints.
- Render template passes the current public JSON schema.
- npm audit reports zero vulnerabilities after dependency updates.
- Heuristic source/build/Git-history secret scan passed before publication; rerun after changes.

## External gates and limitations

- Supplied Signvrse origin returned 503 from authenticated `/v1/me`. Smoke render was not attempted because preflight failed. ASL quality, real render timing, and actual live signing playback remain unverified.
- User-created Twitch OAuth and Extension credentials are not configured yet. Native Twitch Hosted Test, two actual Twitch accounts, CSP/CORS, component sizing, latency calibration, and public approval are not verified by standalone browser tests.
- Actual OBS Browser Source playback and ASL-fluent review remain pending.
- The owner selected AWS hosting using their credits. ECS Express Mode/CodeBuild hosting is in progress; see docs/AWS_HOSTING.md and ignored artifacts/aws-hosting.json. Task roles and Secrets Manager replace local credential profiles in production. Render is an optional template.
- Long-session/capacity/live performance targets are not established by synthetic tests.

## Resume checklist

1. Read `IMPLEMENTATION_PLAN.md` and this latest steering before using the older Google plan.
2. Inspect ignored `artifacts/speech-check.json` and `provider-check.json` for the latest live outcomes; never print secrets.
3. Restore Signvrse account reachability, then run `npm run check:providers -- --render` once and inspect real output with explicit ASL.
4. Configure independent Twitch credentials in ignored `.env`; follow `docs/TWITCH.md` and package with the correct public backend origin.
5. Complete real Hosted Test and OBS gates; keep demo/native/public statuses distinct.
6. Run typecheck/tests/build/browser tests/package/secret scan after changes.
7. Update `docs/VALIDATION.md` with observed evidence and remaining blockers.
