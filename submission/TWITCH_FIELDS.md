# Twitch Version Details and hosting values

Version: 0.0.1. Type: desktop Video Component. Observed state: Hosted Test.

## Copy-ready description

SignCast brings AI-generated ASL signing and English captions to Twitch streams. Broadcasters connect their microphone through the SignCast companion webpage, and viewers see signing inside the Twitch player. Each viewer can independently show or hide signing, adjust timing, replay the last completed phrase, and return to live. Personal replay does not interrupt other viewers. Broadcasters must keep the companion webpage open during capture. SignCast supports desktop Twitch viewing and English speech. If signing is unavailable, captions can continue. This is an experimental AI-generated signing prototype. Signing may contain errors or arrive behind the stream. It is not a replacement for a qualified interpreter.

## Viewer summary

View AI-generated ASL and English captions. Adjust timing, replay the last phrase, or hide signing independently.

## Paths and origins

- Viewer: `viewer.html`
- Configuration: `config.html`
- Live configuration: `live.html`
- Hosted backend origin / media allowlist: `https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws`
- WSS backend: `wss://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws`
- Extension origin allowed by backend: `https://qzfhe2w4mmi1r2g1ds7p0eaqxl4i6k.ext-twitch.tv`
- OAuth callback: `https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws/auth/twitch/callback`
- Privacy: `https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws/privacy`
- Terms: `https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws/terms`
- Support: `https://github.com/moses946/signcast/issues`

Use the closest accurate general category offered by Twitch; do not claim a category exists without checking the console. Use the owner's public author name and a real monitored contact email. The author email is private; support email is public. No placeholder email has been invented.

## Assets

Upload the files under `assets/branding/twitch/` to their matching fields:

- `signcast-logo-100x100.png`
- `signcast-icon-24x24.png`
- `signcast-discovery-300x200.png`
- `signcast-screenshot-1024x768.png` — actual dashboard with Demo data visible, private OBS URL masked. Replace/supplement with an actual native Twitch screenshot once observed; it is not live-signing evidence.

The current rebuilt ZIP is `artifacts/signcast-extension.zip`; HTML entrypoints are at its root. New assets require moving the version back to Local Test, uploading, then returning to Hosted Test. Verify current CSP/CORS and tester access again afterward. Do not submit for public review until actual signing/platform checks pass.
