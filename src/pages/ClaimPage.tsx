import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { predictionRecordApi } from '../services/api';
import { PredictionRecord } from '../types/PredictionRecord';
import { formatNumber } from '../utils/math';
import { tokenUtils } from '../utils/token';
import '../styles/pages.scss';

interface DecodedToken {
  id?: string;
  sub?: string;
  userId?: string;
}

export default function ClaimPage() {
  const [claimableRecords, setClaimableRecords] = useState<PredictionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    const authToken = tokenUtils.getToken();

    if (!authToken) {
      setError('Missing authentication token');
      setIsLoading(false);
      return;
    }

    try {
      const payload = jwtDecode<DecodedToken>(authToken);
      const userId = payload.userId || payload.sub || payload.id;
      if (!userId) {
        throw new Error('Missing user id in token');
      }

      // Fetch claimable records
      const fetchClaimable = async () => {
        try {
          setIsLoading(true);
          const data = await predictionRecordApi.getClaimable(userId);
          setClaimableRecords(data);
        } catch (err) {
          console.error('Failed to fetch claimable records:', err);
          setError('Failed to load claimable rewards');
        } finally {
          setIsLoading(false);
        }
      };

      fetchClaimable();
    } catch (err) {
      console.error('Failed to decode JWT:', err);
      setError('Invalid authentication token');
      setIsLoading(false);
    }
  }, []);

  const handleClaim = async (recordId: string) => {
    try {
      setClaiming(recordId);
      await predictionRecordApi.claimReward(recordId);

      // Remove claimed record from list
      setClaimableRecords(prev => prev.filter(r => r.id !== recordId));
      alert('Reward claimed successfully!');
    } catch (err) {
      console.error('Failed to claim reward:', err);
      alert('Failed to claim reward. Please try again.');
    } finally {
      setClaiming(null);
    }
  };

  const formatDate = (datetime: string | Date) => {
    const date = new Date(datetime);
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Loading claimable rewards...</div>
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
        <h1>🏆 Claimable Rewards</h1>
        <p>Claim your winnings</p>
      </div>

      {claimableRecords.length === 0 ? (
        <div className="empty">
          <p>No claimable rewards available</p>
        </div>
      ) : (
        <div className="claim-list">
          {claimableRecords.map((record) => (
            <div key={record.id} className="claim-card">
              <div className="claim-header">
                <h3>
                  {record.prediction?.homeTeam?.name} vs {record.prediction?.awayTeam?.name}
                </h3>
                <span className="date">{formatDate(record.prediction?.datetime || '')}</span>
              </div>

              <div className="claim-details">
                <div className="detail-row">
                  <span>Your Bet:</span>
                  <strong>{formatNumber(record.predictionAmount)} PICK</strong>
                </div>
                <div className="detail-row">
                  <span>Potential Win:</span>
                  <strong className="win-amount">
                    {formatNumber(Number(record.claimableToken || 0))} PICK
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Selected:</span>
                  <strong>
                    {record.selectedTeam === 'HOME'
                      ? record.prediction?.homeTeam?.name
                      : record.prediction?.awayTeam?.name}
                  </strong>
                </div>
              </div>

              <button
                className="claim-button"
                onClick={() => handleClaim(record.id)}
                disabled={claiming === record.id}
              >
                {claiming === record.id ? 'CLAIMING...' : 'CLAIM REWARD'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
