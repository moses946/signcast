# SignCast

Native desktop Twitch Component Extension for AI-generated ASL signing, English speech captions, personal timing and replay. A broadcaster companion captures a microphone; an OBS Browser Source provides a fallback. Each phrase is rendered once through the hosted Signvrse API and shared across viewers.

**Prototype:** ASL accuracy, native Twitch Hosted Test, OBS playback, and live latency require verification. Synthetic demo media is a test pattern, not sign language.

Hosted demo: [Open SignCast](https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws) · [Public repository](https://github.com/moses946/signcast). The hosted demo uses synthetic media and is not proof of live ASL.

## Latest decisions

- Speech recognition is **Amazon Transcribe Streaming**, replacing the original Google plan at the owner’s request.
- Do not use Signvrse-owned Google credentials, cloud services, backend code, or existing API keys. Only use the separately supplied Signvrse enterprise API key.
- Local AWS authentication uses a dedicated `signcast-developer` login profile and the `signcast-runtime` role profile.
- Twitch app/extension registration is supplied by the owner. Native access before approval requires test-account allowlisting.

## Run locally

Requires Node.js 24 (see `.nvmrc`), npm, and desktop Chrome/Edge. All npm dependencies are public.

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env; begin with MOCK_PROVIDERS=true for the synthetic demo.
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000). In demo mode choose **Try configured demo mode**, then **Start without a microphone** and **Send fixture phrase**. Open the fallback preview, or the demo extension-player link and authorize it. Two players have independent replay controls. The fixture contains no real signing or speech transcription.

For development, `npm run dev` starts backend 3000, companion 5173, and extension 5174. The backend production preview routes require an initial build. Keep `PUBLIC_BASE_URL=http://localhost:3000` for local OAuth.

## Configure live providers

1. Set `MOCK_PROVIDERS=false`.
2. Set `SIGNVRSE_API_BASE_URL` to the single authorized HTTPS origin and add the supplied `SIGNVRSE_API_KEY` to ignored `.env`.
3. Set `AWS_REGION=eu-west-1`. Authenticate with `aws login --profile signcast-developer --region eu-west-1` and configure the restricted runtime profile described in [AWS setup](docs/AWS.md). Do not copy another project’s credentials.
4. Register a Twitch OAuth application, with the exact redirect `http://localhost:3000/auth/twitch/callback`. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_REDIRECT_URI`.
5. Follow [native extension setup](docs/TWITCH.md) for the separate extension registration and base64 signing secret.
6. Run `npm run check:providers -- --aws`. This checks API reachability and AWS identity, not ASL quality or Transcribe authorization. `--render` explicitly requests one short billable ASL render when account preflight succeeds.

Keep `.env` outside version control. Provider keys never go into `VITE_` variables. Do not paste them into issues or logs.

## Native Twitch experience

The extension consumes authorized channel feed metadata and signing video from the backend. Configure `viewer.html`, `config.html`, and `live.html` in Twitch. The broadcaster must keep the companion webpage open with microphone permission. Twitch does not provide the raw speech feed used by this app.

```powershell
# Set VITE_API_BASE_URL in .env to your deployed HTTPS backend origin first.
npm run package:extension
```

Upload **the contents** of `artifacts/signcast-extension.zip` through Twitch Developer Console. The ZIP has entrypoints at its root. Read [Twitch setup](docs/TWITCH.md) before Hosted Test. Never describe a test-only extension as publicly released.

## OBS fallback

Copy the fallback URL from the companion, including its fragment token. Add a 640×480 Browser Source. The page is muted, uses the same clips, and needs no microphone permission. Its token grants read access only. OBS is a fallback, not evidence that native Twitch playback works.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run package:extension
npm run scan:secrets
```

The two-viewer browser tests use fixtures. Read [validation](docs/VALIDATION.md) for the remaining real-service, Twitch, ASL, and OBS gates. No live claim is implied by a passing fixture test.

## Hosting and operating limits

See [AWS hosting](docs/AWS_HOSTING.md) for the selected deployment and [deployment](docs/DEPLOYMENT.md) for general requirements. The server is stateful and runs as one instance. Restart clears OAuth sessions, captures, captions, and clips; the broadcaster reconnects. Each capture is capped at one hour and 300 render requests. The queue retains at most three unstarted phrases, with explicit overload pausing. Media retention is bounded at 128 MiB, ten completed clips, and two minutes. Up to 25 feed viewers are admitted; verify capacity before claiming production scale.

SignCast keeps no audio recordings. It retains transient PCM only for streaming backpressure, and short-lived captions/video for display/replay. Audio is transmitted to AWS; phrase text is sent to Signvrse. Their processing, logging, and retention policies are separate. Stop clears application session buffers. Do not use the prototype as a substitute for a qualified interpreter where accuracy is critical.

## Troubleshooting

- **Signvrse 503:** configured origin is unavailable; do not retry renders blindly or switch origins with the key automatically.
- **AWS preflight fails:** authenticate the configured independent profile and verify the region. Identity success does not prove streaming permission.
- **Speech denied:** runtime identity needs `transcribe:StartStreamTranscription` in the selected region.
- **Twitch authorization fails:** OAuth and extension secrets differ. Check redirect URI, signing secret, expiry, and extension origin allowlists.
- **Video expired:** return to live; retention intentionally has a hard bound.
- **Signing overload:** captions continue. Slow speech, check provider speed, then explicitly resume signing.
- **No signing in Twitch:** confirm test-account allowlist, active Component slot, backend CSP/CORS origins, HTTPS/WSS, and live capture state.

## Ownership and attribution

SignCast application code is newly created for this project. Signvrse is a separately hosted API dependency; no rights to its backend or avatar assets are granted here. Confirm API use, project ownership, and competition eligibility independently before submission. The synthetic FFmpeg fixture is documented in `fixtures/README.md`.
