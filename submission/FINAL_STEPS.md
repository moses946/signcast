# Submission control sheet

Deadline: **3 November 2026, 01:00 Africa/Nairobi** (2 November, 14:00 PST). Submit before that boundary.

## Prepared

- Public independent repository, deployment, reproducible extension ZIP, setup and handoff docs.
- Draft description and form values: DEVPOST_DRAFT.md.
- Codex session ID verified from the process environment: `01a19aeb-e2f3-7611-9b71-92986ea57fb4`.
- Under-three-minute recording script: VIDEO_SCRIPT.md.
- Judge access instructions: JUDGE_ACCESS.md.
- Twitch fields, paths, policy URLs, and image assets: TWITCH_FIELDS.md.
- Automated acceptance evidence in docs/VALIDATION.md and docs/PRE_SUBMISSION_CHECKLIST.md.

## Independent owner/platform checks — do these before waiting for the API

1. Complete actual companion Twitch sign-in and confirm the displayed channel is `mk__dons`.
2. Install and activate the Hosted Test component; check real Helper authorization and live captions inside Twitch.
3. Add a second intended Twitch test account and verify personal controls from both accounts. Only one account is currently confirmed allowlisted.
4. Upload the latest extension ZIP and set the hosted privacy/terms URLs as needed. Confirm media/connection allowlists. Changes may require returning to Local Test then Hosted Test.
5. Verify an actual OBS Browser Source and, for normal-viewer judge access, the broadcast output. OBS was not found in the standard local installation paths during preparation; install/setup and actual playback cannot be assumed.
6. Save a Devpost draft with the prepared description, repository URL, session ID, and honest current status. No Devpost draft or submission is claimed to have been created by these files.

## When Signvrse recovers

1. Run `npm run check:providers -- --render` once; this may charge for a short render. Confirm a playable file and explicit ASL, obtain ASL review, and record actual timing.
2. On the hosted companion click **Retry signing feed**, or start a fresh session. Do not replay speech missed during the outage automatically.
3. Speak new phrases and verify real signing in native Twitch and OBS; two viewers must control replay independently with one shared render per phrase.
4. Record the real signing/Twitch segments, assemble the video using VIDEO_SCRIPT.md, add English captions, upload publicly to YouTube, and verify signed-out access.
5. Update the draft's evidence/limitations and judge access instructions to match what actually passed, then submit Devpost before the deadline.

Only mark each check complete with observed evidence. No document or fixture can replace the actual provider/platform checks, public video URL, or submission receipt.
