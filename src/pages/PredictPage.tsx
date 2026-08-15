import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PredictionModal from '../components/PredictionModal';
import { predictionApi } from '../services/api';
import { Prediction } from '../types/Prediction';
import { formatNumber } from '../utils/math';
import '../styles/pages.scss';

export default function PredictPage() {
  const { matchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Prediction | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (matchId) {
          setSelectedMatch(await predictionApi.getPredictionById(matchId));
          return;
        }

        setPredictions(await predictionApi.getUpcoming());
      } catch (err) {
        console.error('Failed fetch predictions:', err);
        setError('Failed load predictions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  const handlePredictionSuccess = async () => {
    try {
      setPredictions(await predictionApi.getUpcoming());
    } catch (err) {
      console.error('Failed refresh predictions:', err);
    }
  };

  const closeModal = () => {
    setSelectedMatch(null);
    if (matchId) navigate('/predict');
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Predictions</h1>
        <p>Make predictions and earn PICK</p>
      </div>

      {!matchId && (
        <button
          type="button"
          className="predict-leaderboard-cta"
          onClick={() => navigate('/leaderboard?provider=TELEGRAM')}
        >
          View Leaderboard
        </button>
      )}

      {error ? (
        <div className="error">{error}</div>
      ) : isLoading ? (
        <div className="loading">Loading {matchId ? 'match' : 'predictions'}...</div>
      ) : !matchId && predictions.length === 0 ? (
        <div className="empty">
          <p>No upcoming matches available</p>
        </div>
      ) : !matchId ? (
        <div className="match-list">
          {predictions.map((match) => (
            <div
              key={match.id}
              className="match-card"
              onClick={() => setSelectedMatch(match)}
            >
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
          ))}
        </div>
      ) : null}

      {selectedMatch && (
        <PredictionModal
          match={selectedMatch}
          onClose={closeModal}
          onPredictionSuccess={handlePredictionSuccess}
        />
      )}
    </div>
  );
}

function formatDate(datetime: string | Date) {
  return new Date(datetime).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(datetime: string | Date) {
  return new Date(datetime).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
