import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { tokenUtils } from '../utils/token';
import '../styles/mini-game.scss';

export default function MiniGamePage() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const authToken = searchParams.get('auth_token') ?? '';

  useEffect(() => {
    if (authToken) {
      tokenUtils.setToken(authToken, 'TELEGRAM');
    }
  }, [authToken]);

  const miniGameUrl = `/mini-game/?auth_token=${encodeURIComponent(authToken)}`;

  return (
    <div className="mini-game-container">
      <iframe
        src={miniGameUrl}
        className="mini-game-iframe"
        title="Mini Game"
        allow="fullscreen"
      />
    </div>
  );
}
