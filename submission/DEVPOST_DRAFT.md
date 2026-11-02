# SignCast

## Elevator pitch

AI-generated ASL and captions for Twitch, with personal replay.

## Inspiration

Live streams move quickly, and viewers need different ways to follow the same conversation. We wanted to bring signing and captions into the Twitch player while letting each viewer control timing and replay without interrupting anyone else.

## What it does

SignCast is an experimental desktop Twitch Component Extension with a broadcaster companion and an OBS fallback. A broadcaster connects Twitch, selects a microphone, and starts capture. Amazon Transcribe produces English captions. Finalized phrases are submitted once to the hosted Signvrse API for AI-generated ASL video and shared across viewers.

Viewers can show or hide signing, adjust timing, replay the last completed phrase, and return to live. Personal replay reuses retained media and does not request a new paid render or pause another viewer. If signing is unavailable, captions can continue, with an explicit unavailable state and broadcaster-controlled retry.

## How we built it

We built a new standalone TypeScript repository using Node.js 24, Express, WebSockets, React, Vite, AudioWorklet, Amazon Transcribe Streaming, and the hosted Signvrse API. Twitch OAuth identifies the broadcaster; Twitch Extension Helper authorization grants channel-scoped viewer access. AWS ECS hosts the server, with a task role for transcription and Secrets Manager for provider credentials.

Codex implemented the workspace, microphone resampling, streaming integration, authentication, bounded phrase queue and media cache, viewer playback/replay, deployment scripts, fixtures, automated checks, and handoff documentation. We used tests and real provider/configuration checks to distinguish observed behavior from assumptions. No private Signvrse backend code or avatar assets are distributed in this repository.

## Challenges

The hardest problem is coordinating a shared render pipeline with independent viewer playback. Rendering must happen once per phrase, but timing, hiding, and replay belong to each viewer. We bounded buffers and queues, retained reusable clip bytes, preserved signing speed, and made skipped or delayed signing visible. Twitch playback delay is an estimate, so viewers also have a personal adjustment.

Another challenge was an upstream Signvrse outage. We separated caption availability from signing availability, so a renderer outage does not require a fake interpretation or prevent testing speech recognition. Synthetic fixtures are persistently labeled and are never presented as real ASL.

## What we learned

A successful API request does not establish sign-language accuracy, and a passing standalone browser test does not establish native Twitch compatibility. The submission evidence must show the actual platform and disclose language/timing limitations. Operational isolation also matters: SignCast uses its own AWS account/roles and only the separately authorized Signvrse API.

## What's next

ASL-fluent evaluation, measured end-to-end timing on real broadcasts, longer-session reliability testing, and improvements guided by Deaf viewers and interpreters. Multiple broadcasters and mobile support are outside this prototype.

## Current evidence disclosure — keep this accurate when pasting

The extension is in Twitch Hosted Test, not publicly released. Builds, 28 unit/integration checks, four fixture browser checks, a short real Transcribe smoke test, and hosted configuration checks passed. Actual signing/ASL quality, native Twitch playback, two real test accounts, and actual OBS playback must be recorded only when observed. Signvrse currently returns HTTP 503. Do not describe the signing path as validated while that remains true.

## Form values

- Repository: https://github.com/moses946/signcast
- Hosted companion: https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws
- Codex session ID, verified from the current process: `01a19aeb-e2f3-7611-9b71-92986ea57fb4`
- Built with: TypeScript, React, Node.js, Express, Vite, WebSockets, AudioWorklet, Twitch Extensions, Twitch API, Amazon Transcribe, Amazon ECS, Amazon ECR, AWS Secrets Manager, Signvrse API, Codex, Vitest, Playwright.
- Video URL: add the actual public YouTube upload after recording. No video is published by this repository.
- Release state: Twitch Hosted Test, version 0.0.1.
- Broadcaster test channel: https://www.twitch.tv/mk__dons

The draft can be entered before the deadline. Final submission and public video upload remain owner actions. Reconcile every functionality claim with actual recorded evidence before submitting.
