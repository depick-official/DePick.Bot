import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { predictionApi } from '../services/api';
import { Prediction } from '../types/Prediction';
import { formatNumber } from '../utils/math';
import PredictionModal from '../components/PredictionModal';
import '../styles/pages.scss';

export default function PredictPage() {
  const { matchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Prediction | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // M7.4.6 — Auth lives in localStorage via App.tsx's bootstrapAuth.
    // This page no longer reads `?auth_token=` from the URL; the bot mints
    // URLs without any embedded credential.
    const fetchData = async () => {
      try {
        setIsLoading(true);

        if (matchId) {
          // Fetch specific match and auto-open modal
          const match = await predictionApi.getPredictionById(matchId);
          setSelectedMatch(match);
          setShowModal(true);
          setPredictions([match]);
        } else {
          // Fetch all upcoming matches
          const data = await predictionApi.getUpcoming();
          setPredictions(data);
        }
      } catch (err) {
        console.error('Failed to fetch predictions:', err);
        setError('Failed to load predictions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  const handlePredictClick = (match: Prediction) => {
    setSelectedMatch(match);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedMatch(null);

    // If we're on a specific match page, navigate back to list
    if (matchId) {
      navigate('/predict');
    }
  };

  const handlePredictionSuccess = async () => {
    // Refresh predictions after successful bet
    try {
      const data = await predictionApi.getUpcoming();
      setPredictions(data);
    } catch (err) {
      console.error('Failed to refresh predictions:', err);
    }
  };

  const formatDate = (datetime: string | Date) => {
    const date = new Date(datetime);
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };

  const formatTime = (datetime: string | Date) => {
    const date = new Date(datetime);
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Loading predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>⚽ Upcoming Matches</h1>
        <p>Make your predictions</p>
      </div>

      {matchId && !showModal && isLoading ? (
        <div className="loading">Loading match...</div>
      ) : predictions.length === 0 ? (
        <div className="empty">
          <p>No upcoming matches available</p>
        </div>
      ) : !matchId ? (
        <div className="match-list">
          {predictions.map((match) => {
            // M4.3 — odds direct from chain-supplied `homeOdds`/`awayOdds` (fractions [0,1]).
            // Token Pool from `marketCollateralToken` (= LMSR `getMarketCollateral`, or
            // NAIVE-derived equivalent). No more pool-ratio math on the FE.
            return (
              <div
                key={match.id}
                className="match-card"
                onClick={() => handlePredictClick(match)}
              >
                <div className="match-date">
                  {formatDate(match.datetime)} • {formatTime(match.datetime)}
                </div>

                <div className="teams">
                  <div className="team">
                    <img src={match.homeTeam.logo} alt={match.homeTeam.name} />
                    <span>{match.homeTeam.name}</span>
                    <div className="ratio">{formatNumber(match.homeOdds * 100)}%</div>
                  </div>

                  <div className="vs">VS</div>

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

                <button className="predict-button">
                  Make Prediction →
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {showModal && selectedMatch && (
        <PredictionModal
          match={selectedMatch}
          onClose={handleModalClose}
          onPredictionSuccess={handlePredictionSuccess}
        />
      )}
    </div>
  );
}
