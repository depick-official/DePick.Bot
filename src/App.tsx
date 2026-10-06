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
import {
  bootstrapAuth,
  detectBootstrapProvider,
  PairingRequiredError,
} from './services/auth-bootstrap';
import WhatsappPairing from './components/WhatsappPairing';

type AuthState =
  | { status: 'bootstrapping' }
  | { status: 'pairing' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'bootstrapping' });

  useEffect(() => {
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
    <Routes>
      <Route path="/" element={<PredictPage />} />
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:matchId" element={<PredictPage />} />
      <Route path="/games" element={<GamesPage />} />
      <Route path="/custom-arena" element={<CustomArenaPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
      <Route path="/deposit" element={<DepositPage />} />
      <Route path="/buypick" element={<BuyPickQrPage />} />
      <Route path="/dashboard" element={<ModeratorPortalPage />} />
      <Route path="/office-pool" element={<OfficePoolPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
    </Routes>
  );
}

export default App;
