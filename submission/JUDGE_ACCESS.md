# SignCast access for judges

Repository: https://github.com/moses946/signcast

Companion: https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws

Twitch channel: https://www.twitch.tv/mk__dons

Extension installation page: https://www.twitch.tv/ext/qzfhe2w4mmi1r2g1ds7p0eaqxl4i6k-0.0.1

## Native extension

SignCast version 0.0.1 is in **Hosted Test**, not public release. Twitch testing access is restricted to allowed accounts. The owner must arrange access with judges before relying on this route. Only `mk__dons` was observed on the testing allowlist on 2 November 2026. The owner must add other intended testers/judges and verify access; do not claim unrestricted native access yet.

On desktop Twitch, install/activate the Video Component on the test broadcaster's channel and enable it over the player. The broadcaster signs into the companion, selects a microphone, and starts capture. Each viewer controls their own timing, hiding, replay, and return-to-live.

## OBS fallback

The broadcaster copies the read-only browser-source URL from the companion into OBS, at 640×480, and broadcasts the same feed. This makes signing/captions visible to normal channel viewers even while native extension review is pending. The owner must verify the actual broadcast and supply a scheduled demonstration or the public recording. Do not put the full private OBS URL in a public repository or submission description.

## Reproduce independently

Follow README.md using your own AWS and Twitch registrations and an authorized Signvrse API key. All application source is public. For an immediate synthetic check without provider calls, use local `MOCK_PROVIDERS=true`; the interface labels the fixture as Demo data. That verifies controls, not interpretation quality.

## Limitations

Selected microphone only; English speech; desktop MVP; one active broadcaster per deployment. AI-generated ASL and captions may be inaccurate or delayed. Signvrse is an external dependency. Provider outages show unavailable signing while captions can continue. Live language accuracy and end-to-end behavior must be documented in docs/VALIDATION.md before claims are made.
