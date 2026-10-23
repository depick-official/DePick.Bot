import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import GamesPage from './pages/GamesPage';
import MiniGamePage from './pages/MiniGamePage';
import DepositPage from './pages/DepositPage';
import BuyPickQrPage from './pages/BuyPickQrPage';
import OfficePoolPage from './pages/OfficePoolPage';
import LeaderboardPage from './pages/LeaderboardPage';
import CustomArenaPage from './pages/CustomArenaPage';
import ModeratorPortalPage from './pages/ModeratorPortalPage';
import CustomArenaDashboardPage from './pages/CustomArenaDashboardPage';
import WelcomeModal, { WelcomeKind } from './components/WelcomeModal';
import {
    bootstrapAuth,
    detectBootstrapProvider,
    PairingRequiredError,
  } from './services/auth-bootstrap';
import WhatsappPairing from './components/WhatsappPairing';
import WaProvisionPage from './components/WaProvisionPage';

type AuthState =
  | { status: 'bootstrapping' }
  | { status: 'pairing' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

/** /wa-provision is authorized by its own bearer magic-link token, NOT an app
 *  session, so it must bypass the global bootstrapAuth gate. `endsWith` tolerates
 *  a `/bot` deploy base. */
const isProvisionRoute = () => window.location.pathname.endsWith('/wa-provision');

/**
 * Read `?welcome=` once, at module load, before anything can navigate or strip
 * it. The backend only sets it on the sign-in that created the account, so this
 * is the single moment it exists.
 */
function readWelcomeKind(): WelcomeKind | null {
  const value = new URLSearchParams(window.location.search).get('welcome');
  return value === 'referral' || value === 'discord' ? value : null;
}

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'bootstrapping' });
  const [welcome, setWelcome] = useState<WelcomeKind | null>(readWelcomeKind);

  const dismissWelcome = () => {
    setWelcome(null);
    // Drop the flag so a refresh or a shared URL does not replay the greeting.
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  useEffect(() => {
    // The provisioning page carries its own bearer token — skip the session
    // bootstrap (Telegram initData / WhatsApp pairing) entirely for it.
    if (isProvisionRoute()) return;
    // M7.4.6 — Exchange Telegram WebApp initData for a 1h JWT before any
    // page renders. Replaces the legacy ?auth_token= URL parameter.
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    let cancelled = false;

    bootstrapAuth()
      .then(() => {
        if (!cancelled) {
          setAuth({ status: 'ready' });
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        // WhatsApp launch with no usable session → show the device-pairing screen
        // rather than an error (F2/A2).
        if (err instanceof PairingRequiredError) {
          setAuth({ status: 'pairing' });
          return;
        }
        console.error('[auth-bootstrap]', err);
        const launchProvider = detectBootstrapProvider();
        const reopenLabel =
          launchProvider === 'MESSENGER'
            ? 'Messenger'
            : launchProvider === 'DISCORD'
              ? 'Discord'
              : null;
        const message =
          err?.response?.status === 404
            ? reopenLabel
              ? `Could not open this ${reopenLabel} session. Please reopen the Mini App from ${reopenLabel}.`
              : 'Your Telegram account is not registered with DePick yet — please /start the bot first.'
            : reopenLabel
              ? `Could not authenticate. Please reopen this from ${reopenLabel}.`
              : 'Could not authenticate. Please open this from Telegram.';
        setAuth({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Bearer-token provisioning page — rendered directly, bypassing the session
  // auth state machine (the bootstrap effect no-ops on this route).
  if (isProvisionRoute()) {
    return <WaProvisionPage />;
  }

  if (auth.status === 'bootstrapping') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Authenticating…</div>;
  }
  if (auth.status === 'pairing') {
    return <WhatsappPairing onPaired={() => setAuth({ status: 'ready' })} />;
  }
  if (auth.status === 'error') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ff6b6b' }}>
        <h2>Unable to open Mini App</h2>
        <p>{auth.message}</p>
      </div>
    );
  }

  return (
    <>
      {welcome && <WelcomeModal kind={welcome} onClose={dismissWelcome} />}
      <Routes>
        <Route path="/" element={<PredictPage />} />
        <Route path="/predict" element={<PredictPage />} />
        <Route path="/predict/:matchId" element={<PredictPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/custom-arena" element={<CustomArenaPage />} />
        <Route path="/custom-arena/dashboard" element={<CustomArenaDashboardPage />} />
        <Route path="/mini-game" element={<MiniGamePage />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route path="/buypick" element={<BuyPickQrPage />} />
        <Route path="/dashboard" element={<ModeratorPortalPage />} />
        <Route path="/office-pool" element={<OfficePoolPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>
    </>
  );
}

export default App;
