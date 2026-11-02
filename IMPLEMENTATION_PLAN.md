# SignCast implementation specification

This is the agent-transfer specification. **Latest owner steering overrides the original Google plan: use Amazon Transcribe Streaming in the owner’s independent AWS account. Do not reuse any Signvrse cloud credentials or backend. Only use the separately supplied Signvrse enterprise API.**

## Context and decisions

Build a public-source native desktop Twitch Component Extension that gives viewers ASL signing and English speech captions. A Twitch-authenticated companion captures the broadcaster’s microphone. Each viewer controls visibility, timing, replay, and return-to-live independently. OBS is a fallback using the same feed. Native review/test restrictions must be disclosed.

Stack: Node 24, TypeScript, Express/ws, React/Vite, npm workspaces. One server instance/active broadcaster, in-memory sessions/media, no database/Redis/workers. Twitch hosts extension assets; AWS ECS Express Mode hosts companion/backend, using CodeBuild/ECR images, a scoped task role, and Secrets Manager. This later owner choice supersedes Render as the primary host. ASL first, English en-US speech, Zane avatar, 960×540 upper-body/30 fps, muted video. No runtime LLM, client glossing, Chrome extension, chat replay/EventSub, guest audio, VODs, mobile, or private rendering packages.

## Independent dependency gates

Verify owner-supplied Signvrse account/key and single HTTPS origin before paid renders. API accepts ASL, but rule-based fallback in the private implementation means linguistic quality needs explicit review. Run the ten-phrase evaluation in `docs/VALIDATION.md`, not merely a file-playability check. Do not silently change to KSL.

Verify AWS login/runtime identity and `transcribe:StartStreamTranscription` independently. No S3 bucket or recording pipeline is needed. Scope runtime permissions to the selected region; prefer temporary development credentials and workload roles in production.

Register separate Twitch OAuth app and native Extension. Test the official Helper JWT, backend read-session exchange, media fetch, CSP/CORS, MSE, and complete-file fallback **inside Twitch** before claiming integration success. Allowed test accounts can demonstrate pre-release functionality; public approval is external and cannot be guaranteed.

## Pipeline

Microphone -> AudioWorklet -> stateful 16 kHz mono PCM16 resampler -> authenticated capture WebSocket -> AWS Transcribe -> final English segments -> maximum-16-word phrases -> one shared rendering queue -> Signvrse `/ws/render` -> bounded in-memory fMP4 clips -> feed metadata and authorized streaming media fetch -> independent viewers/OBS.

Partial transcripts never render. Recognition identity/audio timing deduplicates results while allowing repeated real speech. Coalesce nonterminal final fragments at most 600 ms. Preserve wording; split at sentence/clause punctuation before word boundaries.

One in-flight render; maximum three unstarted phrases; maximum wait 20 seconds. Drop oldest unstarted work explicitly under overload, preserve captions, and count the gap. Three drops in 60 seconds pauses signing; captions continue. Render errors pause signing and are never ambiguously retried. Sessions are capped at one hour/300 render submissions.

Signvrse WebSocket accepts `{type:'render',requestId,sentence,signLanguage:'asl',characterId:'Zane',width:960,height:540,fps:30,camera:'upper-body',backgroundColor:'#131c1f'}` with server-side X-API-Key. Responses: accepted, meta, binary fMP4, optional progress, complete/error. Use the returned codec; metadata fields vary for cached results.

HTTP compatibility mode uses `/v1/videos`, async status/video references, trusted-origin checks, idempotency, bounded polling, Retry-After. No automatic HTTP retry after an uncertain WebSocket charge. First-fragment timeout 60 seconds, overall timeout 120 seconds.

## Identity and protocols

Owner OAuth uses authorization-code flow and no chat scopes. Validate state and token identity, keep tokens server-side, refresh/validate maintained sessions, stop revoked sessions. Cookie/CSRF/Origin authentication controls capture and session mutations.

Native extension uses `onAuthorized` JWT, server HS256 signature/expiration/channel/role validation, then a five-minute channel-scoped bearer read session. Channel comes from verified claims. Anonymous opaque viewers need not link identity. Renew before expiry. Backend CORS and WebSocket Origin checks match actual extension origins. OBS has only stable channel-scoped read access from a URL fragment token.

`/ws/feed` sends snapshot/status/transcript/clip/reset/pong after first-message auth. `/api/clips/:id` streams initialization bytes and existing/ongoing fragments from byte zero. Never send video through Twitch PubSub. No viewer affects shared rendering.

## Viewer behavior

Own enable/hide, timing adjustment -5..+15 seconds, replay last completed phrase, and return-to-live. Use Helper broadcaster-latency context plus server-clock/audio timing. This is approximate synchronization; provider latency cannot be undone. Play at 1×, finish active signs, and skip stale unstarted playback when far behind. Hidden/paused viewers release media and join current output on return.

Create independent MediaSource timelines per clip with serialized append handling and object-URL cleanup. Retain active/prebuffering slots. Feature-detect codec support; fall back to complete-MP4 Blob playback at increased latency. Replay retained bytes without upstream calls.

Media bounds: ten completed clips, two-minute TTL, 128 MiB total, 16 MiB per clip, up to 25 feed viewers. Protect active readers during ordinary eviction, enforce hard global capacity, disconnect slow consumers. Transcript history is latest 200 final entries/15 minutes. Stop clears runtime buffers; no audio recordings or full transcripts in logs.

## Delivery and verification

Keep all source independent. Supply npm ci/dev/build/start/typecheck/test/test:e2e/package:extension/scan:secrets. Package root viewer/config/live HTML for Twitch. Add README, AWS/Twitch/deployment/protocol/validation/judging docs, fixture rights, CI, and HANDOFF.

Local credentials stay in ignored `.env` and external AWS profile storage. Production requires a separate credential-refresh/workload-role design; never upload `.aws`, root credentials, Signvrse backend environment, or Google service accounts. No secret frontend variables. Scan source, built assets, and history before publication.

Required real gates: actual microphone transcription, ASL-fluent review, actual Twitch Hosted Test/two viewers, OBS, timing, hidden/paused refresh, provider errors, long session, bounded buffers, deployed HTTPS/WSS. Fixture tests prove the application path only. See `docs/VALIDATION.md` and `HANDOFF.md` for evidence and blockers.
