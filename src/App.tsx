import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import ClaimPage from './pages/ClaimPage';
import MiniGamePage from './pages/MiniGamePage';
import OfficePoolPage from './pages/OfficePoolPage';
import { bootstrapAuth } from './services/auth-bootstrap';

type AuthState =
  | { status: 'bootstrapping' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'bootstrapping' });

  useEffect(() => {
    const telegramWebApp = (window as any).Telegram?.WebApp;
    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();

    bootstrapAuth()
      .then(() => setAuth({ status: 'ready' }))
      .catch((err) => {
        console.error('[auth-bootstrap]', err);
        const message =
          err?.response?.status === 404
            ? 'Your Telegram account is not registered with DePick yet - please /start the bot first.'
            : 'Could not authenticate. Please open this from Telegram.';
        setAuth({ status: 'error', message });
      });
  }, []);

  if (auth.status === 'bootstrapping') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Authenticating...</div>;
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
      <Route path="/" element={<OfficePoolPage />} />
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:matchId" element={<PredictPage />} />
      <Route path="/claim" element={<ClaimPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
      <Route path="/office-pool" element={<OfficePoolPage />} />
    </Routes>
  );
}

export default App;
