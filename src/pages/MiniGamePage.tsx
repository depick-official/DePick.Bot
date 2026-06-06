import { useEffect } from 'react';
import '../styles/mini-game.scss';

export default function MiniGamePage() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const miniGameUrl = '/mini-game/';

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
