import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FeedSnapshot } from '@signcast/shared';
import { SignPlayer } from '@signcast/shared/player';
import { MicrophoneCapture } from './audio/capture';
import '@signcast/shared/styles.css';
type Session = {
  snapshot: FeedSnapshot;
  csrf: string;
  overlayUrl: string;
  captureConnected: boolean;
};
function Dashboard() {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState(''),
    [level, setLevel] = useState(0),
    [capturing, setCapturing] = useState(false),
    [interim, setInterim] = useState(''),
    [demoText, setDemoText] = useState('Welcome to the stream.');
  const capture = useRef(new MicrophoneCapture());
  async function refresh() {
    const response = await fetch('/api/session');
    if (response.ok) {
      const data = await response.json();
      setSession(data);
      return data as Session;
    }
    setSession(null);
    return null;
  }
  useEffect(() => {
    void refresh();
    return () => {
      void capture.current.stop();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/control`,
      );
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth' }));
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot')
          setSession((old) => (old ? { ...old, snapshot: msg.snapshot } : old));
        if (msg.type === 'status') {
          setSession((old) =>
            old ? { ...old, snapshot: { ...old.snapshot, session: msg.session } } : old,
          );
          if (msg.session.state !== 'running') {
            void capture.current.stop();
            setCapturing(false);
            setLevel(0);
          }
        }
        if (msg.type === 'transcript') {
          if (msg.segment.final) {
            setInterim('');
            setSession((old) =>
              old
                ? {
                    ...old,
                    snapshot: {
                      ...old.snapshot,
                      transcripts: [
                        ...old.snapshot.transcripts.filter((t) => t.id !== msg.segment.id),
                        msg.segment,
                      ].slice(-200),
                    },
                  }
                : old,
            );
          } else setInterim(msg.segment.text);
        }
        if (msg.type === 'reset')
          setSession((old) =>
            old ? { ...old, snapshot: { ...old.snapshot, transcripts: [], clips: [] } } : old,
          );
      };
      socket.onclose = () => {
        if (disposed) return;
        if (socket.readyState === WebSocket.CLOSED) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [session?.snapshot.session.channelId]);
  async function action(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Request failed.');
    return data;
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  async function microphones() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    setDevices(
      (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'),
    );
  }
  async function start() {
    if (!session) return;
    const state = session.snapshot.session.state;
    await action(`/api/session/${state === 'idle' ? 'start' : 'resume'}`);
    try {
      await capture.current.start(
        device,
        session.csrf,
        (n) => setLevel(Math.min(1, n * 5)),
        (message) => {
          setError(message);
          setCapturing(false);
          setLevel(0);
        },
      );
      setCapturing(true);
      await refresh();
    } catch (e) {
      await action('/api/session/pause');
      throw e;
    }
  }
  const state = session?.snapshot.session;
  const demo = state?.demo;
  return (
    <div className="dashboard">
      <header className="site-header">
        <a href="/" className="wordmark">
          ◈ signcast<span>for Twitch</span>
        </a>
        <span className="prototype-tag">ASL ACCESSIBILITY PROTOTYPE</span>
        {session ? (
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await capture.current.stop();
                await action('/auth/logout');
                setSession(null);
                setCapturing(false);
              })
            }
          >
            Disconnect Twitch
          </button>
        ) : (
          <a className="secondary button" href="/auth/twitch">
            Connect Twitch ↗
          </a>
        )}
      </header>
      {demo && (
        <div className="demo-banner">
          DEMO DATA · synthetic media and transcripts · no live ASL, AWS, or Signvrse requests
        </div>
      )}
      <main>
        <section className="hero">
          <p className="eyebrow">A MORE INCLUSIVE LIVE STREAM</p>
          <h1>
            Let your audience
            <br />
            <em>see what you’re saying.</em>
          </h1>
          <p className="hero-copy">
            Your voice. A shared signing feed. Every viewer in control.
            <br />
            Connect your microphone and bring ASL signing into Twitch.
          </p>
        </section>
        {!session ? (
          <section className="welcome-card">
            <div>
              <p className="eyebrow">GET STARTED</p>
              <h2>Your microphone is the only input.</h2>
              <p>
                Sign in with Twitch, choose a microphone, then activate the SignCast Component
                Extension. Keep this page open while you stream.
              </p>
              <a className="primary button" href="/auth/twitch">
                Connect Twitch ↗
              </a>
              <button
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    const r = await fetch('/auth/demo', { method: 'POST' });
                    if (!r.ok)
                      throw new Error('Demo mode is disabled. Configure Twitch OAuth to connect.');
                    await refresh();
                  })
                }
              >
                Try configured demo mode
              </button>
            </div>
            <ol className="steps">
              <li>
                <span>01</span>Connect your Twitch channel
              </li>
              <li>
                <span>02</span>Choose your microphone
              </li>
              <li>
                <span>03</span>Start signing for your audience
              </li>
            </ol>
          </section>
        ) : (
          <>
            <div className="channel-row">
              <div>
                <p className="eyebrow">BROADCASTER WORKSPACE</p>
                <h2>{state?.displayName}</h2>
              </div>
              <span className={`status-label ${capturing ? 'online' : ''}`}>
                {capturing
                  ? '● MICROPHONE LIVE'
                  : state?.state === 'running'
                    ? '● FEED RUNNING'
                    : '○ STANDBY'}
              </span>
            </div>
            <div className="workspace-grid">
              <section className="panel">
                <div className="panel-heading">
                  <span className="step-number">01</span>
                  <h2>Voice input</h2>
                  <span className="subtle">English · en-US</span>
                </div>
                <label htmlFor="microphone">Microphone</label>
                <div className="input-row">
                  <select
                    id="microphone"
                    disabled={capturing || busy}
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    <option value="">System default microphone</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Microphone'}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={capturing || busy}
                    onClick={() => void run(microphones)}
                  >
                    Find inputs
                  </button>
                </div>
                <div className="meter">
                  <meter aria-label="Microphone input level" min="0" max="1" value={level} />
                  <span>{capturing ? 'Listening' : 'Microphone off'}</span>
                </div>
                <div className="control-row">
                  <button
                    className="primary"
                    disabled={busy || capturing}
                    onClick={() => void run(start)}
                  >
                    {busy
                      ? 'Connecting…'
                      : state?.state === 'idle'
                        ? 'Start interpretation'
                        : 'Resume microphone'}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || state?.state === 'idle'}
                    onClick={() =>
                      void run(async () => {
                        await capture.current.stop();
                        setCapturing(false);
                        await action('/api/session/pause');
                        await refresh();
                      })
                    }
                  >
                    Pause
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || state?.state === 'idle'}
                    onClick={() =>
                      void run(async () => {
                        await capture.current.stop();
                        setCapturing(false);
                        await action('/api/session/stop');
                        await refresh();
                      })
                    }
                  >
                    Stop & clear
                  </button>
                </div>
                <p className="fine-print">
                  Only the selected microphone is captured. Desktop audio and guests are not
                  included.
                </p>
                {state?.signingPaused && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await action('/api/session/signing/resume');
                        await refresh();
                      })
                    }
                  >
                    Retry signing feed
                  </button>
                )}
                {demo && (
                  <div className="demo-input">
                    <label htmlFor="demo-text">Synthetic demo phrase</label>
                    <input
                      id="demo-text"
                      value={demoText}
                      onChange={(e) => setDemoText(e.target.value)}
                    />
                    <button
                      className="secondary"
                      disabled={state?.state !== 'running'}
                      onClick={() => void run(() => action('/api/demo/phrase', { text: demoText }))}
                    >
                      Send fixture phrase
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          await action('/api/session/start');
                          await refresh();
                        })
                      }
                    >
                      Start without a microphone
                    </button>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <span className="step-number">02</span>
                  <h2>Shared signing feed</h2>
                  <span className="live-pill">ASL</span>
                </div>
                <div className="feed-art">
                  <div className="feed-orbit">◈</div>
                  <p>
                    One interpretation.
                    <br />
                    <strong>Every viewer’s own experience.</strong>
                  </p>
                </div>
                <div className="metrics">
                  <div>
                    <strong>{state?.viewers || 0}</strong>
                    <span>viewers connected</span>
                  </div>
                  <div>
                    <strong>{state?.queued || 0}</strong>
                    <span>phrases waiting</span>
                  </div>
                  <div>
                    <strong>{state?.skipped || 0}</strong>
                    <span>signing gaps</span>
                  </div>
                </div>
                <div className="provider-row">
                  <span>
                    Speech <b>{state?.providers.speech}</b>
                  </span>
                  <span>
                    Signing <b>{state?.providers.signvrse}</b>
                  </span>
                </div>
              </section>
            </div>
            <div className="workspace-grid lower">
              <section className="panel transcript-panel">
                <div className="panel-heading">
                  <h2>Live transcript</h2>
                  <span className="subtle">Final speech drives signing</span>
                </div>
                <div className="transcript-log" aria-label="Final speech transcript">
                  {session.snapshot.transcripts.length ? (
                    session.snapshot.transcripts.slice(-12).map((t) => (
                      <p key={t.id}>
                        <span className="timestamp">
                          {new Date(t.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {t.text}
                        {t.skipped && <small> · signing skipped</small>}
                      </p>
                    ))
                  ) : (
                    <p className="empty-state">Your next words start here.</p>
                  )}
                  {interim && <p className="interim">{interim}</p>}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <span className="step-number">03</span>
                  <h2>Bring it to Twitch</h2>
                </div>
                <p>Activate the native Component Extension for personal timing and replay.</p>
                <a
                  className="secondary button"
                  href="https://dev.twitch.tv/console/extensions"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Twitch Developer Console ↗
                </a>
                <hr />
                <label htmlFor="overlay-url">OBS fallback · 640 × 480 Browser Source</label>
                <div className="input-row">
                  <input id="overlay-url" readOnly value={session.overlayUrl} />
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(() => navigator.clipboard.writeText(session.overlayUrl))
                    }
                  >
                    Copy
                  </button>
                </div>
                <a
                  className="text-button"
                  href={session.overlayUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open fallback preview ↗
                </a>
                {demo && (
                  <a
                    className="text-button"
                    href="/extension-preview/viewer.html?demo=1"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open demo extension player ↗
                  </a>
                )}
                <p className="fine-print">
                  OBS and native viewers reuse this feed. Replaying never requests another render.
                </p>
              </section>
            </div>
          </>
        )}
        {(error || state?.error) && (
          <div className="error global-error" role="alert">
            {error || state?.error?.message}
          </div>
        )}
        <footer>
          Built for shared live experiences.{' '}
          <span>Powered by Signvrse · ASL AI-generated signing</span>
          <p>
            Prototype interpretation may be incomplete or inaccurate. No audio recording is stored
            by SignCast.
          </p>
          <p>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{' '}
            <a href="https://github.com/moses946/signcast/issues">Support</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
function Overlay() {
  const match = location.pathname.match(/^\/overlay\/(\d+)$/);
  const token = location.hash.slice(1);
  const access = token ? { apiBase: location.origin, token } : null;
  return (
    <div className="obs-page">
      {match && access ? (
        <SignPlayer access={access} overlay />
      ) : (
        <p className="error">Open the complete fallback URL from your broadcaster dashboard.</p>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  location.pathname.startsWith('/overlay/') ? <Overlay /> : <Dashboard />,
);
