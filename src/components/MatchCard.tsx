import { Prediction } from '../types/Prediction';
import { formatNumber } from '../utils/math';

/**
 * Shared upcoming-match card — used by the flat Predictions list (`PredictPage`)
 * and the league-grouped Games browser (`GamesPage`). Tapping it hands the match
 * up so the parent can open the PredictionModal. Kept presentational: no data
 * fetching, no modal state.
 */
export default function MatchCard({
  match,
  onSelect,
}: {
  match: Prediction;
  onSelect: (match: Prediction) => void;
}) {
  return (
    <div className="match-card" onClick={() => onSelect(match)}>
      <div className="match-date">
        {formatDate(match.datetime)} - {formatTime(match.datetime)}
      </div>
      <div className="teams">
        <div className="team">
          <img src={match.homeTeam.logo} alt={match.homeTeam.name} />
          <span>{match.homeTeam.name}</span>
          <div className="ratio">{formatNumber(match.homeOdds * 100)}%</div>
        </div>
        <div className="vs">
          VS
          {match.tieOdds != null && match.tieOdds > 0 && (
            <div className="ratio draw-odds">
              Draw {formatNumber(match.tieOdds * 100)}%
            </div>
          )}
        </div>
        <div className="team">
          <img src={match.awayTeam.logo} alt={match.awayTeam.name} />
          <span>{match.awayTeam.name}</span>
          <div className="ratio">{formatNumber(match.awayOdds * 100)}%</div>
        </div>
      </div>
      <div className="pool-info">
        <div className="pool-item">
          <span>Token Pool: {formatNumber(match.marketCollateralToken)}</span>
        </div>
        <div className="pool-item">
          <span>Credit Pool: {formatNumber(match.totalPoolAmountCredit)}</span>
        </div>
      </div>
      <button className="predict-button">Make Prediction</button>
    </div>
  );
}

function formatDate(datetime: string | Date) {
  return new Date(datetime).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function formatTime(datetime: string | Date) {
  return new Date(datetime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
}
