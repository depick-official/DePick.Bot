import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { tokenUtils } from '../utils/token';

/**
 * WhatsApp device-pairing screen (F2/F6).
 *
 * A `?provider=whatsapp` launch has no URL-borne credential, so the SPA starts an
 * OAuth-device-grant-flavoured handshake:
 *
 *   1. POST /whatsapp/device/start → { deviceCode, userCode, interval, confirmUrl }.
 *   2. The user confirms by sending a hidden `/pair <userCode>` to the DePick
 *      WhatsApp bot — either by tapping the wa.me confirm button (which pre-fills
 *      the message) or by typing it manually from the shown code.
 *   3. We poll POST /whatsapp/device/poll with the deviceCode until it returns
 *      { token, refreshToken }; both are stored and the app proceeds.
 *
 * Robustness (fixed after UAT finding wa_group_auth_pairing/P2):
 *   - EXACTLY ONE handshake. The mount effect uses a per-run `cancelled` flag +
 *     an AbortController (NOT a shared ref): React StrictMode double-invokes the
 *     effect in dev, and the first run's in-flight /device/start is aborted on its
 *     own cleanup, so only the surviving run creates a handshake. (The old shared
 *     `cancelledRef` was reset to false on the second mount, un-cancelling the
 *     first and spawning two poll loops.)
 *   - RESUME across a reload / the WhatsApp round-trip. The active handshake is
 *     persisted in sessionStorage; on mount we resume polling an existing one
 *     instead of minting a fresh code — otherwise leaving to WhatsApp to confirm
 *     and returning orphaned the code the user just approved.
 *
 * The bot socket can be briefly mid-connect when /device/start is called; the BE
 * answers 503 then. We retry with a bounded backoff (A-FE-1) and only surface a
 * friendly "reconnecting" message after the limit, never a dead screen.
 *
 * Plain axios is used (not the shared `api` instance) so this never re-enters the
 * 401 refresh interceptor before a session exists.
 */

interface WhatsappPairingProps {
  onPaired: () => void;
}

interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  interval: number;
  expiresAt: number;
  confirmUrl: string;
}

type PollResponse =
  | { status: 'pending' }
  | { token: string; refreshToken: string };

const START_MAX_RETRIES = 5;
const START_BACKOFF_MS = 2000;
const HANDSHAKE_KEY = 'wa_pairing_handshake';

const baseURL = import.meta.env.VITE_API_URL || '';
const headers = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

/** The active handshake persists so a reload / the WhatsApp round-trip resumes the
 *  SAME deviceCode rather than orphaning the code the user just confirmed. */
function loadHandshake(): DeviceStartResponse | null {
  try {
    const raw = sessionStorage.getItem(HANDSHAKE_KEY);
    if (!raw) return null;
    const hs = JSON.parse(raw) as DeviceStartResponse;
    return hs && hs.deviceCode ? hs : null;
  } catch {
    sessionStorage.removeItem(HANDSHAKE_KEY);
    return null;
  }
}
function saveHandshake(hs: DeviceStartResponse) {
  try {
    sessionStorage.setItem(HANDSHAKE_KEY, JSON.stringify(hs));
  } catch {
    /* sessionStorage unavailable — degrade to in-memory only */
  }
}
function clearHandshake() {
  try {
    sessionStorage.removeItem(HANDSHAKE_KEY);
  } catch {
    /* ignore */
  }
}

export default function WhatsappPairing({ onPaired }: WhatsappPairingProps) {
  const [handshake, setHandshake] = useState<DeviceStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Handle to the WhatsApp confirm tab we opened, so we can close it once
  // pairing completes (the user isn't left stranded on WhatsApp's "Open app" page).
  const confirmWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    // Per-run cancellation (NOT a shared ref). StrictMode double-invokes this
    // effect; the first run is cancelled + aborted on its cleanup, so only the
    // surviving run creates a handshake — no duplicate poll loop.
    let cancelled = false;
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedulePoll = (hs: DeviceStartResponse) => {
      const t = setTimeout(() => poll(hs), Math.max(1, hs.interval) * 1000);
      timers.push(t);
    };

    const start = async (attempt = 0): Promise<void> => {
      try {
        const resp = await axios.post<DeviceStartResponse>(
          `${baseURL}/whatsapp/device/start`,
          {},
          { headers, timeout: 15000, signal: controller.signal },
        );
        if (cancelled) return;
        saveHandshake(resp.data);
        setHandshake(resp.data);
        schedulePoll(resp.data);
      } catch (err: any) {
        if (cancelled || axios.isCancel(err)) return;
        if (err?.response?.status === 503 && attempt < START_MAX_RETRIES) {
          const t = setTimeout(() => start(attempt + 1), START_BACKOFF_MS);
          timers.push(t);
          return;
        }
        setError(
          err?.response?.status === 503
            ? 'The DePick bot is reconnecting. Please close this and try again in a moment.'
            : 'Could not start WhatsApp sign-in. Please reopen the link from WhatsApp.',
        );
      }
    };

    const poll = async (hs: DeviceStartResponse): Promise<void> => {
      if (cancelled) return;
      try {
        const resp = await axios.post<PollResponse>(
          `${baseURL}/whatsapp/device/poll`,
          { deviceCode: hs.deviceCode },
          { headers, timeout: 15000, signal: controller.signal },
        );
        if (cancelled) return;
        if ('token' in resp.data) {
          clearHandshake();
          // Close the WhatsApp confirm tab now that its job is done (cross-origin
          // close is allowed for a window we opened; ignore if already gone).
          try {
            confirmWindowRef.current?.close();
          } catch {
            /* ignore */
          }
          tokenUtils.setToken(resp.data.token, 'WHATSAPP', resp.data.refreshToken);
          onPaired();
          return;
        }
        schedulePoll(hs);
      } catch (err: any) {
        if (cancelled || axios.isCancel(err)) return;
        // An expired/unknown deviceCode (400) means the handshake lapsed before
        // the user confirmed — drop the stale code and ask them to start over.
        if (err?.response?.status === 400) {
          clearHandshake();
          setError(
            'This sign-in request expired. Please reopen the link from WhatsApp for a fresh code.',
          );
        } else {
          setError('Lost connection while signing in. Please reopen the link from WhatsApp.');
        }
      }
    };

    // Resume an in-progress handshake (survives a reload / the WhatsApp
    // round-trip); only mint a fresh one when there is none.
    const existing = loadHandshake();
    if (existing) {
      setHandshake(existing);
      schedulePoll(existing);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      controller.abort();
      timers.forEach(clearTimeout);
    };
    // onPaired is stable for the lifetime of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ff6b6b' }}>
        <h2>WhatsApp sign-in</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!handshake) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Connecting to WhatsApp…
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
      <h2>Confirm it&apos;s you on WhatsApp</h2>
      <p>Tap the button to send a confirmation message to the DePick bot.</p>
      <a
        href={handshake.confirmUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          // Open WhatsApp in a popup we keep a handle to, so we can auto-close it
          // when pairing completes. If the popup is blocked, fall through to the
          // anchor's default target="_blank" (still works, just no auto-close).
          const w = window.open(handshake.confirmUrl, '_blank');
          if (w) {
            confirmWindowRef.current = w;
            e.preventDefault();
          }
        }}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          margin: '1rem 0',
          background: '#25D366',
          color: '#fff',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Confirm on WhatsApp
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
        Or open the DePick chat on WhatsApp and send this message:
      </p>
      <code
        style={{
          display: 'inline-block',
          padding: '0.5rem 0.75rem',
          background: '#f1f1f1',
          borderRadius: 6,
          fontSize: '1rem',
        }}
      >
        /pair {handshake.userCode}
      </code>
      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
        Waiting for your confirmation…
      </p>
    </div>
  );
}
