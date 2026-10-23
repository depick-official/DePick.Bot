import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Community DATA-bot provisioning page (wa-cd R14 / plan decision 7).
 *
 * Reached via a one-tap magic link the CONTROL super-bot DM'd the verified
 * community moderator on /claimgroup success (and on /reconnect recovery). It
 * renders the WhatsApp-Web QR for the community's dedicated-number DATA bot and
 * polls until that bot is linked. Nothing else — no money logic, no auth minting.
 *
 * Auth model (security): the page is authorized ONLY by the `token` query param —
 * a bearer magic link, scope `wa-provision`, single-use, 24h TTL, bound to one
 * community (the communityId is a claim inside the token, so no separate param is
 * needed). It is NOT an app session and is never exchanged for one. The token is
 * kept in memory only, sent solely to the three provisioning endpoints, and never
 * logged, persisted, or rendered.
 *
 * Design (token consume vs. status arbiter): POST /whatsapp/provision-start
 * CONSUMES the single-use token (it also find-or-creates the account row and
 * starts the socket + QR capture). So a failure there is ambiguous — a genuinely
 * dead token, OR a replay of an already-started provisioning whose socket is still
 * live (jti consumed by a prior load). GET /whatsapp/provision/status does NOT
 * consume, so it is the arbiter: a live account status means "keep polling"; a
 * `null` status (no account row) or a 401 means "nothing to provision" → the
 * graceful dead-end message.
 *
 * Plain axios is used (not the shared `api` instance) so this never attaches an
 * app-session JWT nor re-enters the 401 refresh interceptor — the provisioning
 * token travels in the request body / query only.
 */

type WaStatus =
  | 'CONNECTING'
  | 'OPEN'
  | 'RECONNECTING'
  | 'NEEDS_RELINK'
  | 'DISABLED';

type Phase = 'starting' | 'awaiting-scan' | 'linked' | 'dead';

const baseURL = import.meta.env.VITE_API_URL || '';
const headers = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};
const POLL_INTERVAL_MS = 2000;

const DEAD_MESSAGE =
  'This setup link has expired or was already used — ask your group admin to run /reconnect in the group for a fresh link.';

export default function WaProvisionPage() {
  const [phase, setPhase] = useState<Phase>('starting');
  const [qr, setQr] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setPhase('dead');
      return;
    }

    // Per-run cancellation (NOT a shared ref): React StrictMode double-invokes
    // this effect in dev; the first run is cancelled + its in-flight request
    // aborted on cleanup. If that first run already consumed the token before the
    // abort, the surviving run's provision-start 401s and the status probe below
    // recovers it (the socket is already live) — self-healing, no persisted state.
    let cancelled = false;
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const req = { headers, timeout: 15000, signal: controller.signal };
    const die = () => {
      if (!cancelled) setPhase('dead');
    };

    const fetchStatus = async () => {
      const resp = await axios.get<{ status: WaStatus | null; phoneNumber: string | null }>(
        `${baseURL}/whatsapp/provision/status`,
        { ...req, params: { token } },
      );
      return resp.data;
    };

    const fetchQr = async () => {
      const resp = await axios.get<{ qr: string | null }>(
        `${baseURL}/whatsapp/provision/qr`,
        { ...req, params: { token } },
      );
      return resp.data.qr;
    };

    const schedulePoll = () => {
      timers.push(setTimeout(poll, POLL_INTERVAL_MS));
    };

    // Poll loop: status is the source of truth; refresh the QR while we wait.
    const poll = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const s = await fetchStatus();
        if (cancelled) return;
        if (s.status === 'OPEN') {
          setPhoneNumber(s.phoneNumber);
          setPhase('linked'); // stop — both polls end here
          return;
        }
        if (s.status === null || s.status === 'NEEDS_RELINK' || s.status === 'DISABLED') {
          die();
          return;
        }
        // CONNECTING / RECONNECTING → show the (rotating) QR and keep waiting.
        try {
          const q = await fetchQr();
          if (!cancelled && q) setQr(q);
        } catch {
          /* QR blip — keep the last QR and keep polling */
        }
        if (!cancelled) {
          setPhase('awaiting-scan');
          schedulePoll();
        }
      } catch (err: any) {
        if (cancelled || axios.isCancel(err)) return;
        // 401 ⇒ token invalid/expired → graceful dead-end. A transient network
        // error ⇒ keep polling (don't strand a moderator mid-setup).
        if (err?.response?.status === 401) {
          die();
          return;
        }
        schedulePoll();
      }
    };

    const start = async (): Promise<void> => {
      try {
        await axios.post(`${baseURL}/whatsapp/provision-start`, { token }, req);
        if (cancelled) return;
        poll(); // socket + QR capture started (or reused) — begin polling
      } catch (err: any) {
        if (cancelled || axios.isCancel(err)) return;
        // provision-start consumed the token. Disambiguate via the (non-consuming)
        // status endpoint: a live account ⇒ provisioning already underway → poll;
        // null/401/terminal ⇒ nothing to provision → graceful dead-end.
        try {
          const s = await fetchStatus();
          if (cancelled) return;
          if (s.status === 'OPEN') {
            setPhoneNumber(s.phoneNumber);
            setPhase('linked');
            return;
          }
          if (s.status === 'CONNECTING' || s.status === 'RECONNECTING') {
            setPhase('awaiting-scan');
            poll();
            return;
          }
          die(); // null / NEEDS_RELINK / DISABLED
        } catch (probeErr: any) {
          if (cancelled || axios.isCancel(probeErr)) return;
          die();
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, []);

  const wrap = {
    padding: '2rem',
    textAlign: 'center' as const,
    maxWidth: 420,
    margin: '0 auto',
  };

  if (phase === 'dead') {
    return (
      <div style={{ ...wrap, color: '#ff6b6b' }}>
        <h2>Community bot setup</h2>
        <p>{DEAD_MESSAGE}</p>
      </div>
    );
  }

  if (phase === 'linked') {
    return (
      <div style={wrap}>
        <h2>✓ Your community bot is linked</h2>
        <p>
          Your group&apos;s dedicated DePick bot is now connected
          {phoneNumber ? ` (${phoneNumber})` : ''} and ready to serve your members.
        </p>
      </div>
    );
  }

  if (phase === 'starting') {
    return <div style={wrap}>Preparing your community bot…</div>;
  }

  // awaiting-scan
  return (
    <div style={wrap}>
      <h2>Link your community bot</h2>
      <p>
        On your community&apos;s dedicated phone, open WhatsApp →{' '}
        <strong>Linked devices</strong> → <strong>Link a device</strong>, then scan
        this code:
      </p>
      {qr ? (
        <div style={{ margin: '1.5rem 0' }}>
          {/* Match the BE console renderer that scans reliably: error-correction
              level L (WhatsApp's own payload is long; L keeps the grid sparse) and
              a quiet-zone margin (includeMargin — off by default in qrcode.react v3
              — which WhatsApp's scanner needs to locate the code). */}
          <QRCodeSVG value={qr} size={256} level="L" includeMargin />
        </div>
      ) : (
        <p style={{ margin: '1.5rem 0', opacity: 0.7 }}>Generating QR code…</p>
      )}
      <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Waiting for the scan…</p>
    </div>
  );
}
