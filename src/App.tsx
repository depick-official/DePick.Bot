import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import MiniGamePage from './pages/MiniGamePage';
import DepositPage from './pages/DepositPage';
import OfficePoolPage from './pages/OfficePoolPage';
import LeaderboardPage from './pages/LeaderboardPage';
import CustomArenaPage from './pages/CustomArenaPage';
import { bootstrapAuth, detectBootstrapProvider } from './services/auth-bootstrap';

type AuthState =
  | { status: 'bootstrapping' }
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
      <Route path="/custom-arena" element={<CustomArenaPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
      <Route path="/deposit" element={<DepositPage />} />
      <Route path="/office-pool" element={<OfficePoolPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
    </Routes>
  );
}

export default App;
