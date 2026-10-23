import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PredictionModal from '../components/PredictionModal';
import MatchCard from '../components/MatchCard';
import { predictionApi } from '../services/api';
import { Prediction } from '../types/Prediction';
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
            <MatchCard key={match.id} match={match} onSelect={setSelectedMatch} />
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
