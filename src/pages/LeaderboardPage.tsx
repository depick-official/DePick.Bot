import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  leaderboardApi,
  LeaderboardResponse,
  LeaderboardUserRanking,
} from '../services/api';
import '../styles/pages.scss';

type LeaderboardTab = 'volume' | 'bigPicks' | 'referral';

const DEFAULT_BIG_PICK_THRESHOLD = 100;

const EMPTY_LEADERBOARD: LeaderboardResponse = {
  volumeRanking: [],
  bigPredictionRanking: [],
  referralRanking: [],
};

const TABS: Array<{ id: LeaderboardTab; label: string }> = [
  { id: 'volume', label: 'Volume' },
  { id: 'bigPicks', label: 'Big Picks' },
  { id: 'referral', label: 'Referrals' },
];

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Upper-case to match the Provider enum the BE scopes by. Mini-App links stamp a
  // lower-case provider (e.g. ?provider=whatsapp), the same way auth-bootstrap normalises it.
  const provider = searchParams.get('provider')?.toUpperCase() || undefined;
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('volume');
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse>(EMPTY_LEADERBOARD);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    leaderboardApi
      .getTopUsers(provider)
      .then((data) => {
        if (!cancelled) {
          setLeaderboard(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load leaderboard:', err);
        if (!cancelled) {
          setError('Could not load leaderboard.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  const activeRows = useMemo(() => {
    if (activeTab === 'bigPicks') return leaderboard.bigPredictionRanking;
    if (activeTab === 'referral') return leaderboard.referralRanking;
    return leaderboard.volumeRanking;
  }, [activeTab, leaderboard]);

  const bigPickThreshold = leaderboard.bigPickThreshold ?? DEFAULT_BIG_PICK_THRESHOLD;
  const firstPlace = activeRows[0];
  const scopeLabel =
    provider === 'TELEGRAM' ? 'Telegram' : provider === 'WHATSAPP' ? 'WhatsApp' : 'All DePick';

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-shell">
        <header className="leaderboard-header">
          <button type="button" className="leaderboard-back" onClick={() => navigate('/predict')}>
            Back
          </button>
          <div>
            <h1>Leaderboard</h1>
            <p>{scopeLabel}</p>
          </div>
        </header>

        <nav className="leaderboard-tabs" aria-label="Leaderboard category">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {isLoading ? (
          <div className="leaderboard-state">Loading leaderboard...</div>
        ) : error ? (
          <div className="leaderboard-state error">{error}</div>
        ) : activeRows.length === 0 ? (
          <div className="leaderboard-state">No ranked users yet.</div>
        ) : (
          <>
            {firstPlace && (
              <section className="leaderboard-leader">
                <span className="leaderboard-crown">#1</span>
                <UserAvatar user={firstPlace} />
                <div className="leaderboard-leader-copy">
                  <strong>{getDisplayName(firstPlace)}</strong>
                  <span>{getValueLabel(activeTab, firstPlace)}</span>
                </div>
              </section>
            )}

            <section className="leaderboard-list" aria-label={`${scopeLabel} leaderboard`}>
              {activeRows.map((user, index) => (
                <article
                  key={`${activeTab}-${user.id}`}
                  className={`leaderboard-row ${index === 0 ? 'first' : ''}`}
                >
                  <span className="leaderboard-rank">{index + 1}</span>
                  <UserAvatar user={user} />
                  <div className="leaderboard-user">
                    <strong>{getDisplayName(user)}</strong>
                    <span>{getSubLabel(activeTab, bigPickThreshold)}</span>
                  </div>
                  <strong className="leaderboard-value">{getValueLabel(activeTab, user)}</strong>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function UserAvatar({ user }: { user: LeaderboardUserRanking }) {
  const name = getDisplayName(user);

  if (user.avatar) {
    return <img className="leaderboard-avatar" src={user.avatar} alt="" />;
  }

  return <span className="leaderboard-avatar fallback">{name.slice(0, 1).toUpperCase()}</span>;
}

function getDisplayName(user: LeaderboardUserRanking): string {
  return user.username?.trim() || `User ${user.id}`;
}

function getSubLabel(tab: LeaderboardTab, bigPickThreshold: number): string {
  if (tab === 'bigPicks') return `Picks of ${bigPickThreshold}+ PICK`;
  if (tab === 'referral') return 'Invites';
  return 'Total staked';
}

function getValueLabel(tab: LeaderboardTab, user: LeaderboardUserRanking): string {
  if (tab === 'bigPicks') return `${user.largePredictionCount ?? 0}`;
  if (tab === 'referral') return `${user.referralCount ?? 0}`;
  return `${formatCompact(user.volume ?? 0)} PICK`;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.floor(value).toString();
}
