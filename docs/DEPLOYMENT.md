# Deployment

The owner selected AWS ECS Express Mode as the primary host. See [AWS hosting](AWS_HOSTING.md). The following generic/Render notes are an optional alternative.

The application builds as one Node 24 service. Its companion/static assets and HTTP/WebSocket backend use one origin. The extension is packaged independently and hosted by Twitch.

```text
Build: npm ci && npm run build
Start: npm start
Health: /healthz
Binding: 0.0.0.0:$PORT
Instances: 1
```

Set `NODE_ENV=production`, `PUBLIC_BASE_URL=https://<host>`, `MOCK_PROVIDERS=false`, the three independent random secrets, Signvrse key/base origin, AWS region/runtime credentials, Twitch OAuth credentials/exact redirect, and extension secret/origin. `VITE_API_BASE_URL` is public and must be set at build time for the extension ZIP.

Root `.env` is local-only. Production variables come from the hosting secret store. Do not upload local login caches, Google credentials, or Signvrse backend configuration. Confirm AWS production credential strategy before launching Render: local `aws login` credentials do not exist there and expire. Prefer an AWS workload role if deploying compute to AWS.

Render supports this server topology and WSS. `render.yaml` is a deployment template, not evidence of a created service. Paid resources and the intended account must be confirmed before creation. Keep the instance always on for live demos. No disk, database, queue worker, or autoscaling is needed.

For smoke testing after deploy: health, OAuth, owner preflight, microphone permission, real STT, Signvrse ASL, Twitch JWT exchange, native Hosted Test playback, two independent viewers, OBS fallback, pause/stop, expired media. No `/healthz` request initiates a paid provider call.

SIGTERM closes capture, provider, and viewer streams. Restart clears runtime data; clients wait for the broadcaster to reconnect. Disable auto-deploy during live demonstrations. Roll back by redeploying a known-good commit and explicitly reauthenticating the broadcaster.
