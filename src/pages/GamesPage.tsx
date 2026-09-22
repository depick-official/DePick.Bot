import { useEffect, useMemo, useState } from 'react';
import PredictionModal from '../components/PredictionModal';
import MatchCard from '../components/MatchCard';
import { predictionApi } from '../services/api';
import { Prediction } from '../types/Prediction';
import '../styles/pages.scss';
import '../styles/games.scss';

/**
 * `/games` — browse upcoming games grouped by league. Opened WhatsApp-side by the
 * `/games` command (exchange-token Mini-App link); the route is channel-agnostic.
 *
 * v1 does the grouping client-side from `GET /predictions/active` (each game
 * carries `tournament`) — no new backend endpoint. Leagues are ordered by
 * upcoming-game count ("most active first" = the popularity proxy, since the
 * backend has no popularity field), and the busiest league auto-selects.
 */
export default function GamesPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLeague, setActiveLeague] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Prediction | null>(null);
  // tournament code → operator-set display name (source of truth). Empty until
  // loaded / where unset; pills then fall back to the derived label.
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        // Leagues are best-effort — if that call fails we still render games and
        // fall back to the derived label, so a naming outage never blocks browsing.
        const [games, leaguesMeta] = await Promise.all([
          predictionApi.getUpcoming(),
          predictionApi.getLeagues().catch(() => []),
        ]);
        setPredictions(games);
        setDisplayNames(
          new Map(
            leaguesMeta
              .filter((l) => l.displayName)
              .map((l) => [l.tournament, l.displayName as string]),
          ),
        );
      } catch (err) {
        console.error('Failed fetch games:', err);
        setError('Failed to load games');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Group by league (tournament), then order leagues by game count desc.
  const leagues = useMemo(() => {
    const groups = new Map<string, Prediction[]>();
    for (const p of predictions) {
      const key = p.tournament ?? 'OTHER';
      const arr = groups.get(key);
      if (arr) arr.push(p);
      else groups.set(key, [p]);
    }
    return [...groups.entries()]
      .map(([tournament, games]) => ({ tournament, games }))
      .sort((a, b) => b.games.length - a.games.length);
  }, [predictions]);

  // Auto-select the busiest league; keep the current one if it still exists.
  useEffect(() => {
    if (!leagues.length) {
      setActiveLeague(null);
      return;
    }
    setActiveLeague((cur) =>
      cur && leagues.some((l) => l.tournament === cur) ? cur : leagues[0].tournament,
    );
  }, [leagues]);

  const activeGames =
    leagues.find((l) => l.tournament === activeLeague)?.games ?? [];

  const refresh = async () => {
    try {
      setPredictions(await predictionApi.getUpcoming());
    } catch (err) {
      console.error('Failed refresh games:', err);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Games</h1>
        <p>Browse upcoming games by league</p>
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : isLoading ? (
        <div className="loading">Loading games...</div>
      ) : leagues.length === 0 ? (
        <div className="empty">
          <p>No upcoming games available</p>
        </div>
      ) : (
        <>
          {/* Scrollable league pill bar — swipe to reach any league. */}
          <nav className="league-tabs" aria-label="Leagues">
            {leagues.map((l) => (
              <button
                key={l.tournament}
                className={l.tournament === activeLeague ? 'active' : ''}
                onClick={() => setActiveLeague(l.tournament)}
              >
                {displayNames.get(l.tournament) ?? leagueLabel(l.tournament)}
                <span className="count">{l.games.length}</span>
              </button>
            ))}
          </nav>

          <div className="match-list">
            {activeGames.map((match) => (
              <MatchCard key={match.id} match={match} onSelect={setSelectedMatch} />
            ))}
          </div>
        </>
      )}

      {selectedMatch && (
        <PredictionModal
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onPredictionSuccess={refresh}
        />
      )}
    </div>
  );
}

// Codes the heuristic below can't infer (vowel-containing acronyms like UEFA, or
// special casing). Extend as needed. The durable fix is a `displayName` column on
// the backend `League` model, served to the SPA — this map is the stop-gap.
const LEAGUE_LABEL_OVERRIDES: Record<string, string> = {
  // UEFA_CHAMPIONS_LEAGUE: 'UEFA Champions League',
};

/**
 * Display name for a tournament code — PREMIER_LEAGUE → "Premier League",
 * NPFL → "NPFL", WORLD_CUP → "World Cup". Per word: an all-consonant token is
 * kept UPPERCASE (a likely acronym — NPFL, MLS); anything containing a vowel is
 * title-cased. This CANNOT catch a vowel-containing acronym — EPL → "Epl",
 * UEFA → "Uefa" — so those need an explicit LEAGUE_LABEL_OVERRIDES entry (or the
 * durable backend `displayName` fix). Overrides always win.
 */
function leagueLabel(tournament: string): string {
  const override = LEAGUE_LABEL_OVERRIDES[tournament];
  if (override) return override;
  return tournament
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) =>
      /[AEIOU]/i.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toUpperCase(),
    )
    .join(' ');
}
