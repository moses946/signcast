# Architecture and protocol

One stateful Node process owns one active broadcaster, its capture socket, one render queue, and a bounded clip store. Per-viewer state stays in the browser. No viewer controls the shared render schedule.

The companion sends mono PCM16 frames after cookie/CSRF/Origin authentication. AWS returns interim/final transcript events. Final deltas are grouped into phrases of at most 16 words. A render adapter calls Signvrse once per phrase; a media store tees fragmented MP4 into bounded memory. WebSocket feed events carry metadata; authenticated HTTPS fetch streams existing initialization bytes plus ongoing fragments to viewers.

Feed messages are `snapshot`, `status`, `transcript`, `clip`, `reset`, and clock-sync `pong`. Unknown/inactive channels return `waiting`. Viewers authenticate in the first WebSocket message: `{type:"auth",token}`. Read tokens expire after five minutes; the extension renews them. OBS fragment tokens are read-only, scoped to a channel, and stable while the deployment secret stays unchanged.

Clip timestamps use a server-anchored audio timeline. A viewer schedules playback at audio end plus estimated Twitch broadcaster latency plus personal adjustment. Clock sync uses server timestamp and a ping midpoint. This approximates alignment; it is not frame-accurate broadcast synchronization. Signing cannot start before provider output is available.

Each clip has an independent MediaSource/video timeline. Replay re-fetches retained bytes; it never calls Signvrse. Backend retention is ten completed clips, two minutes, 128 MiB total, 16 MiB per clip. Active media readers prevent ordinary eviction; hard global capacity still fails a new clip if necessary. Media responses disconnect slow consumers instead of blocking other viewers.

Failure semantics: a render error pauses further signing requests; captions continue. An ambiguous render is never blindly retried. HTTP compatibility mode uses idempotency, trusted-origin job URLs, bounded polling, and Retry-After. Stop aborts rendering and closes all media readers. Pause leaves the current clip able to finish but clears unstarted phrases.

MVP constraints: in-memory sessions, single replica, desktop viewers, bounded connection count, no durable archives. Restart requires broadcaster login/start. Deploying multiple replicas would require shared coordination/media/session storage and is not supported by this repository.
