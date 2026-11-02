import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type ClipMetadata, type FeedSnapshot, targetPlaybackTime } from './index';
type Access = { apiBase: string; token: string };
export function useFeed(access: Access | null) {
  const [snapshot, setSnapshot] = useState<FeedSnapshot | null>(null),
    [connected, setConnected] = useState(false),
    [clockOffset, setClockOffset] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    if (!access) return;
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let tries = 0;
    let ping: ReturnType<typeof setInterval>;
    setSnapshot(null);
    setError('');
    const connect = () => {
      const url = new URL('/ws/feed', access.apiBase);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token: access.token }));
        ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        }, 20_000);
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') {
            setSnapshot(msg.snapshot);
            setClockOffset(msg.snapshot.serverTime - Date.now());
            setConnected(true);
            tries = 0;
            setError('');
          }
          if (msg.type === 'waiting') {
            setConnected(true);
            setClockOffset(msg.serverTime - Date.now());
          }
          if (msg.type === 'pong') setClockOffset(msg.serverTime - (msg.sentAt + Date.now()) / 2);
          if (msg.type === 'status')
            setSnapshot((old) => (old ? { ...old, session: msg.session } : old));
          if (msg.type === 'clip')
            setSnapshot((old) =>
              old
                ? {
                    ...old,
                    clips: [...old.clips.filter((c) => c.id !== msg.clip.id), msg.clip]
                      .filter((c) => Date.now() + clockOffset - c.createdAt < 120_000)
                      .slice(-11),
                  }
                : old,
            );
          if (msg.type === 'transcript' && msg.segment.final)
            setSnapshot((old) =>
              old
                ? {
                    ...old,
                    transcripts: [
                      ...old.transcripts.filter((t) => t.id !== msg.segment.id),
                      msg.segment,
                    ].slice(-200),
                  }
                : old,
            );
          if (msg.type === 'reset')
            setSnapshot((old) =>
              old
                ? { ...old, clips: [], transcripts: [], session: { ...old.session, state: 'idle' } }
                : old,
            );
        } catch {
          setError('Invalid feed response.');
        }
      };
      socket.onclose = (event) => {
        clearInterval(ping);
        setConnected(false);
        if (disposed) return;
        if (event.code === 1008) {
          setError('Authorization expired. Refresh the viewer connection.');
          return;
        }
        setError('Reconnecting to interpretation…');
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(tries++, 5)));
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [access?.apiBase, access?.token]);
  return { snapshot, connected, clockOffset, error };
}

/** One independent media timeline per video; stream append completion is serialized. */
export async function attachClip(
  video: HTMLVideoElement,
  clip: ClipMetadata,
  access: Access,
  signal: AbortSignal,
): Promise<() => void> {
  const response = await fetch(
    new URL(`/api/clips/${encodeURIComponent(clip.id)}`, access.apiBase),
    { headers: { Authorization: `Bearer ${access.token}` }, signal },
  );
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 410
        ? 'This phrase expired. Return to live.'
        : 'Video is unavailable. Return to live.',
    );
  let url: string;
  let source: MediaSource | undefined;
  const dispose = () => {
    video.onended = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (url) URL.revokeObjectURL(url);
  };
  if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(clip.mimeCodec)) {
    delete video.dataset.completeFallback;
    source = new MediaSource();
    url = URL.createObjectURL(source);
    video.src = url;
    try {
      await new Promise<void>((res, rej) => {
        if (signal.aborted) return rej(new DOMException('Aborted', 'AbortError'));
        const aborted = () => {
          cleanup();
          rej(new DOMException('Aborted', 'AbortError'));
        };
        const opened = () => {
          cleanup();
          res();
        };
        const cleanup = () => {
          signal.removeEventListener('abort', aborted);
          source!.removeEventListener('sourceopen', opened);
        };
        signal.addEventListener('abort', aborted, { once: true });
        source!.addEventListener('sourceopen', opened, { once: true });
      });
      const buffer = source.addSourceBuffer(clip.mimeCodec);
      const reader = response.body.getReader();
      const append = async (data: Uint8Array) =>
        new Promise<void>((res, rej) => {
          const done = () => {
            cleanup();
            res();
          };
          const failed = () => {
            cleanup();
            rej(new Error('Cannot decode this video. Try complete-video playback.'));
          };
          const aborted = () => {
            cleanup();
            rej(new DOMException('Aborted', 'AbortError'));
          };
          const cleanup = () => {
            buffer.removeEventListener('updateend', done);
            buffer.removeEventListener('error', failed);
            signal.removeEventListener('abort', aborted);
          };
          buffer.addEventListener('updateend', done, { once: true });
          buffer.addEventListener('error', failed, { once: true });
          signal.addEventListener('abort', aborted, { once: true });
          try {
            buffer.appendBuffer(data as Uint8Array<ArrayBuffer>);
          } catch (error) {
            cleanup();
            rej(error);
          }
        });
      // Loading continues asynchronously so the first fragment can play before render completion.
      void (async () => {
        try {
          while (!signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            await append(value);
          }
          if (!signal.aborted && source!.readyState === 'open') source!.endOfStream();
        } catch {
          if (!signal.aborted) video.dispatchEvent(new Event('error'));
        } finally {
          reader.releaseLock();
        }
      })();
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
  }
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  url = URL.createObjectURL(blob);
  video.src = url;
  video.dataset.completeFallback = 'true';
  return dispose;
}

export function SignPlayer({
  access,
  latencySeconds = 0,
  externalPaused = false,
  overlay = false,
  forceDemo = false,
}: {
  access: Access | null;
  latencySeconds?: number;
  externalPaused?: boolean;
  overlay?: boolean;
  forceDemo?: boolean;
}) {
  const { snapshot, connected, clockOffset, error: feedError } = useFeed(access);
  const [enabled, setEnabled] = useState(true),
    [adjustment, setAdjustment] = useState(0),
    [replaying, setReplaying] = useState(false),
    [error, setError] = useState(''),
    [activeClip, setActiveClip] = useState<ClipMetadata | null>(null),
    [late, setLate] = useState(false);
  const videos = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const [visible, setVisible] = useState(0);
  const visibleRef = useRef(0);
  const playing = useRef(false);
  const seen = useRef(new Set<string>());
  const last = useRef<ClipMetadata | null>(null);
  const loading = useRef<AbortController | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const prepared = useRef<{
    id: string;
    slot: number;
    controller: AbortController;
    ready: Promise<(() => void) | undefined>;
  } | null>(null);
  const suspended = useRef(false);
  const wasConnected = useRef(false);
  const [completeFallback, setCompleteFallback] = useState(false);
  const latest = useRef({
    snapshot,
    access,
    enabled,
    externalPaused,
    adjustment,
    latencySeconds,
    clockOffset,
  });
  latest.current = {
    snapshot,
    access,
    enabled,
    externalPaused,
    adjustment,
    latencySeconds,
    clockOffset,
  };
  const cancel = useCallback(() => {
    const next = prepared.current;
    prepared.current = null;
    if (next) {
      next.controller.abort();
      void next.ready.then((dispose) => dispose?.());
    }
    loading.current?.abort();
    cleanup.current?.();
    cleanup.current = null;
    for (const v of videos) v.current?.pause();
    playing.current = false;
    setActiveClip(null);
    setReplaying(false);
  }, []);
  const play = useCallback(async (clip: ClipMetadata, replay = false) => {
    const state = latest.current;
    if (!state.access || !state.enabled || state.externalPaused) return;
    playing.current = true;
    setError('');
    setReplaying(replay);
    const prefetched = prepared.current?.id === clip.id ? prepared.current : null;
    if (prepared.current && !prefetched) {
      prepared.current.controller.abort();
      void prepared.current.ready.then((dispose) => dispose?.());
    }
    prepared.current = null;
    const slot = prefetched?.slot ?? 1 - visibleRef.current;
    const video = videos[slot].current!;
    const controller = prefetched?.controller ?? new AbortController();
    loading.current = controller;
    try {
      const dispose = prefetched
        ? await prefetched.ready
        : await attachClip(video, clip, state.access, controller.signal);
      if (!dispose) throw new Error('The preloaded phrase expired. Return to live.');
      if (controller.signal.aborted) {
        dispose();
        return;
      }
      cleanup.current?.();
      cleanup.current = dispose;
      visibleRef.current = slot;
      setVisible(slot);
      setActiveClip(clip);
      setCompleteFallback(video.dataset.completeFallback === 'true');
      setLate(
        !replay &&
          Date.now() +
            state.clockOffset -
            targetPlaybackTime(clip, state.latencySeconds, state.adjustment) >
            3000,
      );
      video.onended = () => {
        last.current = clip;
        playing.current = false;
        setReplaying(false);
        setActiveClip(null);
      };
      video.onerror = () => {
        playing.current = false;
        setReplaying(false);
        setError('Video could not be decoded. Return to live or use a supported desktop browser.');
      };
      await video.play();
    } catch (e) {
      if (!controller.signal.aborted) {
        playing.current = false;
        setReplaying(false);
        setError(e instanceof Error ? e.message : 'Video unavailable.');
      }
    }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const s = latest.current;
      if (!s.enabled || s.externalPaused || !s.snapshot || s.snapshot.session.state === 'idle')
        return;
      const now = Date.now() + s.clockOffset;
      const clips = s.snapshot.clips.filter(
        (c) => c.status !== 'failed' && c.bytes > 0 && !seen.current.has(c.id),
      );
      if (playing.current) {
        const next = clips[0];
        if (
          !prepared.current &&
          next &&
          s.access &&
          targetPlaybackTime(next, s.latencySeconds, s.adjustment) <= now + 10_000
        ) {
          const slot = 1 - visibleRef.current;
          const controller = new AbortController();
          prepared.current = {
            id: next.id,
            slot,
            controller,
            ready: attachClip(videos[slot].current!, next, s.access, controller.signal).catch(
              () => undefined,
            ),
          };
        }
        return;
      }
      let candidates = clips.filter(
        (c) => targetPlaybackTime(c, s.latencySeconds, s.adjustment) <= now,
      );
      if (
        candidates.length > 1 &&
        now - targetPlaybackTime(candidates[0], s.latencySeconds, s.adjustment) > 20_000
      ) {
        for (const c of candidates.slice(0, -1)) seen.current.add(c.id);
        candidates = candidates.slice(-1);
      }
      const clip = candidates[0];
      if (clip) {
        seen.current.add(clip.id);
        void play(clip);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [play]);
  useEffect(() => {
    if (!enabled || externalPaused) {
      suspended.current = true;
      cancel();
      const clips = latest.current.snapshot?.clips || [];
      for (const clip of clips) seen.current.add(clip.id);
    } else if (suspended.current) {
      suspended.current = false;
      const clips = latest.current.snapshot?.clips || [];
      for (const clip of clips.slice(0, -1)) seen.current.add(clip.id);
      if (clips.at(-1)) seen.current.delete(clips.at(-1)!.id);
    }
  }, [enabled, externalPaused, cancel]);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      cancel();
      const clips = latest.current.snapshot?.clips || [];
      for (const clip of clips.slice(0, -1)) seen.current.add(clip.id);
      if (clips.at(-1)) seen.current.delete(clips.at(-1)!.id);
    }
    wasConnected.current = connected;
  }, [connected, cancel]);
  useEffect(() => {
    if (snapshot?.session.state === 'idle') {
      cancel();
      seen.current.clear();
      last.current = null;
    }
  }, [snapshot?.session.state, cancel]);
  useEffect(() => () => cancel(), [cancel, access?.token]);
  function live() {
    cancel();
    const clips = snapshot?.clips || [];
    for (const clip of clips.slice(0, -1)) seen.current.add(clip.id);
    if (clips.at(-1)) seen.current.delete(clips.at(-1)!.id);
    setError('');
  }
  const demo = forceDemo || snapshot?.session.demo || activeClip?.demo;
  const caption =
    (snapshot?.session.signingPaused && !replaying
      ? snapshot?.transcripts.at(-1)?.text
      : activeClip?.text) ||
    snapshot?.transcripts.at(-1)?.text ||
    'Signing and captions will appear here.';
  return (
    <section
      className={`sign-player ${overlay ? 'overlay-player' : ''}`}
      aria-label="ASL interpretation"
    >
      <div className="player-top">
        <span className="brand-small">◈ SignCast</span>
        <span className="live-pill">
          {replaying
            ? 'REPLAY'
            : !enabled
              ? 'HIDDEN'
              : externalPaused
                ? 'PAUSED'
                : !connected
                  ? 'CONNECTING'
                  : snapshot?.session.state === 'running'
                    ? 'LIVE'
                    : 'STANDBY'}
        </span>
      </div>
      {demo && (
        <div className="demo-banner" role="status">
          DEMO DATA · synthetic video fixture · not ASL interpretation
        </div>
      )}
      <div className="video-stage" hidden={!enabled}>
        {videos.map((ref, i) => (
          <video
            key={i}
            ref={ref}
            muted
            playsInline
            className={visible === i && activeClip ? 'active' : ''}
            aria-label="AI-generated ASL signing"
          />
        ))}
        {!activeClip && (
          <div className="stage-idle">
            <span className="orbit">◈</span>
            <strong>
              {externalPaused
                ? 'Playback paused'
                : snapshot?.session.state === 'running'
                  ? 'Listening for the next phrase'
                  : 'Ready when your streamer is'}
            </strong>
            <span>ASL · AI-generated signing prototype</span>
          </div>
        )}
      </div>
      <p className="phrase-caption">
        {enabled ? caption : 'Interpretation hidden. Enable it whenever you need it.'}
      </p>
      {(error || feedError) && (
        <p className="error" role="alert">
          {error || feedError}
        </p>
      )}
      {late && activeClip && !replaying && (
        <p className="fine-print">Signing is behind the broadcast.</p>
      )}
      {completeFallback && activeClip && (
        <p className="fine-print">Complete-video playback adds delay.</p>
      )}
      {snapshot?.session.signingPaused && (
        <p className="error" role="status">
          Signing unavailable or paused. Live captions continue.
        </p>
      )}
      {!overlay && (
        <div className="viewer-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Show signing
          </label>
          <button
            className="secondary"
            disabled={!last.current || !enabled || externalPaused}
            onClick={() => {
              const clip = last.current;
              if (clip) {
                cancel();
                void play(clip, true);
              }
            }}
          >
            ↶ Replay phrase
          </button>
          <button className="secondary" onClick={live}>
            Return to live
          </button>
        </div>
      )}
      <label className="delay-control">
        {overlay ? 'Output delay' : 'Personal timing'}{' '}
        <output>
          {adjustment > 0 ? '+' : ''}
          {adjustment}s
        </output>
        <input
          aria-label="Signing timing adjustment in seconds"
          type="range"
          min="-5"
          max="15"
          step="0.5"
          value={adjustment}
          onChange={(e) => setAdjustment(Number(e.target.value))}
        />
      </label>
      <p className="fine-print">ASL — AI-generated signing. Timing and interpretation may vary.</p>
    </section>
  );
}
