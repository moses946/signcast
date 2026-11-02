import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SignPlayer, useFeed } from '@signcast/shared/player';
import '@signcast/shared/styles.css';
interface ExtensionAuth {
  token: string;
  channelId: string;
  clientId: string;
  userId: string;
}
interface Context {
  hlsLatencyBroadcaster?: number;
  isPaused?: boolean;
}
declare global {
  interface Window {
    Twitch?: {
      ext: {
        onAuthorized: (fn: (auth: ExtensionAuth) => void) => void;
        onContext: (fn: (context: Context) => void) => void;
        onVisibilityChanged: (fn: (visible: boolean) => void) => void;
      };
    };
  }
}
const apiBase = (import.meta.env.VITE_API_BASE_URL || location.origin).replace(/\/$/, '');
function App() {
  const [access, setAccess] = useState<{ apiBase: string; token: string } | null>(null),
    [error, setError] = useState(''),
    [demo, setDemo] = useState(false),
    [latency, setLatency] = useState(0),
    [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(true);
  const config = /\/(config|live)\.html$/.test(location.pathname);
  useEffect(() => {
    let cancelled = false;
    let refresh: ReturnType<typeof setTimeout>;
    let current: ExtensionAuth | undefined;
    let retry = 0;
    const exchange = async (auth: ExtensionAuth) => {
      current = auth;
      clearTimeout(refresh);
      try {
        const response = await fetch(`${apiBase}/api/extension/session`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            'Twitch authorization could not be verified. Check extension registration and backend settings.',
          );
        if (cancelled) return;
        setAccess({ apiBase, token: data.token });
        setDemo(data.demo);
        setError('');
        retry = 0;
        refresh = setTimeout(
          () => {
            if (current) void exchange(current);
          },
          Math.max(10, data.expiresIn - 45) * 1000,
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Connection failed.');
          refresh = setTimeout(
            () => {
              if (current) void exchange(current);
            },
            Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5)),
          );
        }
      }
    };
    if (new URLSearchParams(location.search).get('demo') === '1') {
      setError(
        'Open the companion dashboard and connect demo mode, then authorize this demo viewer.',
      );
    } else if (window.Twitch?.ext) {
      window.Twitch.ext.onAuthorized((auth) => void exchange(auth));
      window.Twitch.ext.onContext((context) => {
        if (Number.isFinite(context.hlsLatencyBroadcaster))
          setLatency(context.hlsLatencyBroadcaster!);
        if (typeof context.isPaused === 'boolean') setPaused(context.isPaused);
      });
      window.Twitch.ext.onVisibilityChanged(setVisible);
    } else
      setError(
        'Open this extension inside Twitch. Local fixture mode is available from the companion dashboard.',
      );
    return () => {
      cancelled = true;
      clearTimeout(refresh);
    };
  }, []);
  async function authorizeDemo() {
    try {
      const session = await fetch(`${apiBase}/api/session`, { credentials: 'include' });
      if (!session.ok) throw new Error('Connect demo mode in the companion dashboard first.');
      const owner = await session.json();
      const response = await fetch(`${apiBase}/api/demo/viewer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': owner.csrf },
      });
      if (!response.ok) throw new Error('Demo mode is disabled.');
      const data = await response.json();
      setAccess({ apiBase, token: data.token });
      setDemo(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot connect demo.');
    }
  }
  return (
    <main className="extension-page">
      {config ? (
        <Configuration access={access} demo={demo} />
      ) : (
        <SignPlayer
          access={access}
          latencySeconds={latency}
          externalPaused={paused || !visible}
          forceDemo={demo}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {new URLSearchParams(location.search).get('demo') === '1' && (
        <button className="secondary" onClick={() => void authorizeDemo()}>
          Authorize demo viewer
        </button>
      )}
    </main>
  );
}
function Configuration({
  access,
  demo,
}: {
  access: { apiBase: string; token: string } | null;
  demo: boolean;
}) {
  const { snapshot, connected } = useFeed(access);
  return (
    <section className="panel config-panel">
      <p className="eyebrow">◈ SIGNCAST FOR TWITCH</p>
      <h1>
        Make room for
        <br />
        every viewer.
      </h1>
      {demo && <div className="demo-banner">DEMO DATA — synthetic fixture</div>}
      <p>ASL signing and English captions, with personal replay and timing controls.</p>
      <ol className="config-steps">
        <li>Open the companion and sign in as this channel’s broadcaster.</li>
        <li>Select your microphone and start interpretation.</li>
        <li>Keep the companion page open while you stream.</li>
        <li>Activate this Component Extension on your channel.</li>
      </ol>
      <a className="primary button" href={apiBase} target="_blank" rel="noreferrer">
        Open broadcaster companion ↗
      </a>
      <p className="status-label">
        Feed: {connected ? snapshot?.session.state || 'waiting for broadcaster' : 'connecting'}
      </p>
      <p className="fine-print">
        {snapshot?.session.displayName || 'This channel'} · ASL AI-generated signing prototype.
        Desktop only. Microphone capture happens in the companion webpage.
      </p>
    </section>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
