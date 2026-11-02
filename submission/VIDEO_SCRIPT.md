# SignCast demonstration — target 2 minutes 40 seconds

Record at 1080p. Use only your own speech and screen content. Keep private OBS URLs, credentials, email, stream keys, and notifications out of frame. Add English captions. Record actual Twitch playback; do not substitute a fabricated player mockup.

| Time      | Screen                                          | Spoken script / action                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Twitch channel and SignCast component           | “SignCast brings AI-generated ASL signing and English captions into Twitch, with playback controls personal to each viewer.”                                                                                                                                                                       |
| 0:15–0:35 | Companion microphone selector and level meter   | “The broadcaster signs in with Twitch and captures a selected microphone. Audio goes to Amazon Transcribe; finalized phrases go once to the hosted Signvrse API.” Start capture.                                                                                                                   |
| 0:35–1:05 | Actual Twitch player with component visible     | Speak new phrases: “Hello. Welcome to the stream.” “We are starting a new game.” “Thank you for watching.” Show captions and real signing. Do not label the sequence live if it is prerecorded.                                                                                                    |
| 1:05–1:35 | Two Twitch viewer windows                       | “Both viewers share one render. This viewer can replay the last phrase while the other continues independently.” Replay on one; show the other staying live. Hide/show and adjust timing.                                                                                                          |
| 1:35–1:55 | OBS preview and browser source                  | “The same feed also works as an OBS Browser Source. It does not create another render.” Show the actual source, then stop capture and verify cleanup.                                                                                                                                              |
| 1:55–2:20 | Codex implementation chat and public repository | “I built the standalone app with Codex: capture, auth, streaming, bounded buffering, replay, tests, and AWS deployment. Provider credentials remain server-side, and the private Signvrse backend is not included.” Show code/test evidence without revealing this chat's earlier API-key message. |
| 2:20–2:40 | Twitch component and clear status slide         | “This is an AI-generated signing prototype in Hosted Test. Accuracy and timing can vary; it is not a replacement for a qualified interpreter.” State the actual measured latency and ASL review findings only if collected.                                                                        |

## Prepare while Signvrse is offline

You can record your own introductory narration, architecture, controls, caption fallback, repository, and Codex build evidence now. Clearly identify caption-only or synthetic footage. Leave the 0:35–1:55 real-signing/platform sequence for the recovery test. Do not publish a synthetic fixture as the core interpretation demonstration.

## Final checks

- Under three minutes; actual project functioning on Twitch and Codex build evidence included.
- Upload publicly to YouTube, then verify the link in a signed-out browser.
- Include captions and the Hosted Test/prototype disclosure.
- Paste the actual URL into Devpost, not an unuploaded filename.
