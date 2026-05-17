import { useState, useEffect } from 'react';
import { Prediction } from '../types/Prediction';
import { SelectedTeam, CurrencyType, CreatePredictionRecordRequest } from '../types/PredictionRecord';
import { formatNumber, formatToTwoDecimals } from '../utils/math';
import { predictionRecordApi, predictionApi, userApi } from '../services/api';
import '../styles/modal.scss';

interface PredictionModalProps {
  match: Prediction;
  onClose: () => void;
  onPredictionSuccess?: () => void;
}

export default function PredictionModal({ match, onClose, onPredictionSuccess }: PredictionModalProps) {
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [amount, setAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [potentialWin, setPotentialWin] = useState<string>('0');
  const [ratio, setRatio] = useState<string>('0');

  // Extract userId from JWT and fetch user data
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const extractedUserId = payload.userId || payload.sub || payload.id;
        setUserId(extractedUserId);

        // Fetch user data to get balance
        userApi.getUserById(extractedUserId).then((user) => {
          setUserBalance(Number(user.token) || 0);
        }).catch(err => {
          console.error('Failed to fetch user:', err);
        });
      } catch (err) {
        console.error('Failed to decode JWT:', err);
      }
    }
  }, []);

  // M4.3 — chain-true post-slippage quote from BE. Debounced so dragging the
  // slider doesn't fire one RPC per pixel. Cleanup cancels the in-flight timer
  // AND ignores stale responses if the user moved on before the call returned.
  useEffect(() => {
    if (!selectedTeam || amount <= 0) {
      setPotentialWin('0');
      setRatio('0');
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const quote = await predictionApi.getQuote(match.id, { selectedTeam, amount });
        if (cancelled) return;
        setPotentialWin(quote.potentialPayout.toString());
        setRatio(quote.avgEntryPrice.toString());
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch quote:', err);
        setPotentialWin('0');
        setRatio('0');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [amount, selectedTeam, match.id]);

  const handleTeamSelect = (team: SelectedTeam) => {
    setSelectedTeam(team);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setAmount(Math.min(newValue, userBalance));
  };

  const handleAmountChange = (increment: number) => {
    setAmount((prevAmount) => {
      const newAmount = prevAmount + increment;
      return Math.min(newAmount, userBalance);
    });
  };

  const handleConfirm = async () => {
    if (!selectedTeam) {
      alert('Please select a team');
      return;
    }
    if (amount === 0 || amount > userBalance) {
      alert('Please enter a valid amount');
      return;
    }
    if (!userId) {
      alert('User not authenticated');
      return;
    }

    setIsLoading(true);
    try {
      const formData: CreatePredictionRecordRequest = {
        userId,
        predictionId: match.id,
        currencyType: CurrencyType.TOKEN,
        selectedTeam,
        predictionAmount: amount,
        homeTeamPool: match.marketVolumeToken.home,
        awayTeamPool: match.marketVolumeToken.away
      };

      await predictionRecordApi.createPredictionRecord(formData);
      setShowSuccess(true);
      if (onPredictionSuccess) {
        onPredictionSuccess();
      }
    } catch (error) {
      console.error('Failed to create prediction:', error);
      alert('Failed to place prediction. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    onClose();
  };

  // Odds direct from chain-supplied fields (M4.1). Fractions in [0,1].

  // Success modal
  if (showSuccess) {
    return (
      <div className="overlay" onClick={handleCloseSuccess}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Prediction Placed Successfully!</h3>
          </div>
          <div className="modal-body success-body">
            <p className="success-label">Place amount:</p>
            <p className="success-amount">{amount} PICK</p>
            <p className="success-label">Potential Win:</p>
            <p className="success-win">+ {formatToTwoDecimals(potentialWin)} PICK</p>
            <p className="success-message">Good Luck!</p>
            <button className="confirm-button" onClick={handleCloseSuccess}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Team selection (before amount input)
  if (!selectedTeam) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Select Team</h3>
          </div>
          <div className="modal-body">
            <div className="match-title">
              <p>{match.homeTeam.name} vs {match.awayTeam.name}</p>
              <p className="subtitle">Choose which team will win</p>
            </div>

            <button
              onClick={() => handleTeamSelect(SelectedTeam.HOME)}
              className="team-button"
            >
              <div className="team-info">
                <img src={match.homeTeam.logo} alt={match.homeTeam.name} />
                <span>{match.homeTeam.name}</span>
              </div>
              <span className="odds">{formatNumber(match.homeOdds * 100)}%</span>
            </button>

            <button
              onClick={() => handleTeamSelect(SelectedTeam.AWAY)}
              className="team-button"
            >
              <div className="team-info">
                <img src={match.awayTeam.logo} alt={match.awayTeam.name} />
                <span>{match.awayTeam.name}</span>
              </div>
              <span className="odds">{formatNumber(match.awayOdds * 100)}%</span>
            </button>

            <button onClick={onClose} className="cancel-button">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Amount input modal (after team selected)
  const selectedTeamInfo = selectedTeam === SelectedTeam.HOME ? match.homeTeam : match.awayTeam;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Place Prediction</h3>
        </div>

        <div className="modal-body">
          {/* Match Info */}
          <div className="match-section">
            <img src={selectedTeamInfo.logo} alt={selectedTeamInfo.name} className="team-logo" />
            <div>
              <p className="vs-title">{match.homeTeam.name} vs {match.awayTeam.name}</p>
              <p className="chosen-team">{selectedTeamInfo.name}</p>
            </div>
            <div className="prize-pool">
              <p>Prize Pool</p>
              <span>{formatNumber(match.marketCollateralToken)} PICK</span>
            </div>
          </div>

          {/* Amount Section */}
          <div className="amount-section">
            <div className="section-header">
              <p>Amount:</p>
              <span>Balance: {formatToTwoDecimals(userBalance)} PICK</span>
            </div>
            <p className="amount-display">{formatToTwoDecimals(amount)} PICK</p>
          </div>

          {/* Betting Section */}
          <div className="betting-section">
            <input
              type="range"
              min="0"
              max={userBalance}
              value={amount}
              onChange={handleSliderChange}
              className="slider"
            />
            <div className="slider-labels">
              <span>0</span>
              <span>50%</span>
              <span>100%</span>
            </div>

            <div className="quick-buttons">
              <button onClick={() => handleAmountChange(25)}>+25</button>
              <button onClick={() => handleAmountChange(50)}>+50</button>
              <button onClick={() => handleAmountChange(100)}>+100</button>
              <button onClick={() => setAmount(userBalance)}>Max</button>
            </div>
          </div>

          {/* Win Section */}
          <div className="win-section">
            <div className="section-header">
              <p>To Win:</p>
              <span>Avg. Price: {Math.round(Number(ratio) * 100)}</span>
            </div>
            <p className="win-display">{formatToTwoDecimals(potentialWin)} PICK</p>
          </div>

          {/* Confirm Button */}
          <button
            className="confirm-button"
            onClick={handleConfirm}
            disabled={isLoading || amount === 0}
          >
            {isLoading ? 'PROCESSING...' : 'CONFIRM'}
          </button>

          {/* Back Button */}
          <button onClick={() => setSelectedTeam(null)} className="cancel-button">
            Change Team
          </button>
        </div>
      </div>
    </div>
  );
}
