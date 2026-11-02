# Native Twitch Component Extension

## Two separate registrations

1. **OAuth application** for broadcaster identity. Register exact local and deployed callback URLs ending `/auth/twitch/callback`. Set its client ID/secret on the server. No chat scopes are requested.
2. **Extension** for viewer/configuration surfaces. Select desktop **Component** support. Its base64 signing secret belongs only on the server as `TWITCH_EXTENSION_SECRET`; it is not the OAuth secret.

Set the viewer path to `viewer.html`, configuration path to `config.html`, and live configuration path to `live.html`. Set a component aspect/size that leaves the face, hands, captions, and controls legible. Mobile is outside this MVP.

## Backend and bundle

Set root `.env` `VITE_API_BASE_URL` to the backend HTTPS origin before `npm run package:extension`. All frontend dependencies are bundled. Only the official Extension Helper is loaded remotely. Do not iframe the companion into the extension.

On the server set:

```text
TWITCH_EXTENSION_CLIENT_ID=<extension client ID>
TWITCH_EXTENSION_SECRET=<base64 secret; server only>
TWITCH_EXTENSION_ALLOWED_ORIGINS=https://<extension-client-id>.ext-twitch.tv
```

Match the actual Origin observed in Twitch tests. Add explicit development origins for Local Test only. Server CORS allows bearer-token reads from approved origins without third-party cookies. WebSockets must also use approved origins.

Configure Twitch Developer Console allowlists:

- URL fetching: backend HTTPS origin and its WSS endpoint origin as supported by the console.
- Media: backend HTTPS origin.
- Scripts: bundled scripts plus the Twitch Helper; no arbitrary remote JavaScript.
- Confirm `blob:` media playback is accepted by the effective Twitch CSP during Hosted Test.

## Authentication

The Helper invokes `onAuthorized`. SignCast exchanges that JWT for a five-minute read session. Backend verifies HS256 with the extension’s signing secret, expiration, channel, role, and opaque viewer identity; it derives the channel from verified claims. Viewer-supplied channel IDs do not grant access. The extension refreshes read authorization before expiry. No linked Twitch identity permission is required for read-only viewing and personal replay.

Configuration links the broadcaster to a separate companion page. Broadcaster OAuth owner ID controls capture. Linking does not grant another channel capture rights.

## Local and Hosted Test

1. Start the backend, then run `npm run dev:extension:https` and visit `https://localhost:5174/viewer.html` once to trust the generated development certificate. Configure this HTTPS base in Twitch Local Test. Include `https://localhost:5174` in `DEV_ALLOWED_ORIGINS`. Plain Vite HTTP is only for standalone development.
2. Install and activate the extension on the owner’s channel.
3. Allowlist the broadcaster and two separate viewer test accounts.
4. Verify real Helper authorization and video fetch/playback within Twitch.
5. Upload the ZIP and move to Hosted Test; repeat authorization, CSP, streaming, complete-file fallback, timing, replay, and hide/show checks.
6. Compare two viewers: personal replay/timing must not change the other viewer’s playback or upstream render count.

Standalone `/extension-preview/viewer.html?demo=1` is explicitly synthetic development mode and does not prove Twitch integration.

Public release requires Twitch approval. Test versions are visible only to allowed accounts and limited staff. Do not assume approval dates. Provide judges tester-access instructions and the OBS fallback.

References: [Extensions](https://dev.twitch.tv/docs/extensions/), [Helper](https://dev.twitch.tv/docs/extensions/reference/), [lifecycle](https://dev.twitch.tv/docs/extensions/life-cycle/).
