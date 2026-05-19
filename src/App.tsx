import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import MiniGamePage from './pages/MiniGamePage';
import { bootstrapAuth } from './services/auth-bootstrap';

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

    bootstrapAuth()
      .then(() => setAuth({ status: 'ready' }))
      .catch((err) => {
        console.error('[auth-bootstrap]', err);
        const message =
          err?.response?.status === 404
            ? 'Your Telegram account is not registered with DePick yet — please /start the bot first.'
            : 'Could not authenticate. Please open this from Telegram.';
        setAuth({ status: 'error', message });
      });
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
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:matchId" element={<PredictPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
    </Routes>
  );
}

export default App;
