import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { customArenaApi, userApi } from '../services/api';
import { CustomArenaMarket } from '../types/CustomArena';
import { formatNumber, formatToTwoDecimals } from '../utils/math';
import '../styles/modal.scss';

interface CustomArenaPredictionModalProps {
  market: CustomArenaMarket;
  initialOption?: 0 | 1 | null;
  onClose: () => void;
  onPredictionSuccess?: () => void;
}

export default function CustomArenaPredictionModal({
  market,
  initialOption = null,
  onClose,
  onPredictionSuccess,
}: CustomArenaPredictionModalProps) {
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(initialOption);
  const [amount, setAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [userBalance, setUserBalance] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.userId || payload.sub || payload.id;
      userApi.getUserById(userId)
        .then((user) => setUserBalance(Number(user.token) || 0))
        .catch((err) => console.error('Failed fetch user:', err));
    } catch (err) {
      console.error('Failed decode JWT:', err);
    }
  }, []);

  const selectedOdds = selectedOption === null ? 0 : market.odds?.[selectedOption] ?? 0;
  const selectedLabel = selectedOption === 0 ? 'Yes' : 'No';
  const potentialWin = selectedOdds > 0 ? amount / selectedOdds : 0;

  const handleAmountChange = (delta: number) => {
    setAmount((current) => Math.min(userBalance, Math.max(0, current + delta)));
  };

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(Number(event.target.value));
  };

  const handleConfirm = async () => {
    if (selectedOption === null) {
      alert('Choose Yes or No.');
      return;
    }
    if (amount <= 0 || amount > userBalance) {
      alert('Enter a valid PICK amount.');
      return;
    }

    setIsLoading(true);
    try {
      await customArenaApi.predictMarket(market.id, selectedOption, amount);
      setShowSuccess(true);
      onPredictionSuccess?.();
    } catch (error) {
      console.error('Failed create custom arena prediction:', error);
      // Surface the backend's reason (e.g. "Prediction exceeds this market's stake cap")
      // from the 400 body instead of a generic message. NestJS `message` may be a string
      // or (for validation errors) a string[]; fall back to the generic text.
      const apiMessage = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      const detail = Array.isArray(apiMessage) ? apiMessage.join(', ') : apiMessage;
      alert(detail || 'Failed place prediction. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    onClose();
  };

  if (showSuccess) {
    return (
      <div className="overlay" onClick={handleCloseSuccess}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Prediction Placed Successfully!</h3>
          </div>
          <div className="modal-body success-body">
            <p className="success-label">Place amount:</p>
            <p className="success-amount">{formatToTwoDecimals(amount)} PICK</p>
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

  if (selectedOption === null) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Select Outcome</h3>
          </div>
          <div className="modal-body">
            <div className="match-title">
              <p>{market.questionText}</p>
              <p className="subtitle">Choose your prediction</p>
            </div>

            <button onClick={() => setSelectedOption(0)} className="team-button">
              <div className="team-info">
                <span className="custom-arena-option-mark">Y</span>
                <span>Yes</span>
              </div>
              <span className="odds">{formatNumber((market.odds?.[0] ?? 0) * 100)}%</span>
            </button>

            <button onClick={() => setSelectedOption(1)} className="team-button">
              <div className="team-info">
                <span className="custom-arena-option-mark">N</span>
                <span>No</span>
              </div>
              <span className="odds">{formatNumber((market.odds?.[1] ?? 0) * 100)}%</span>
            </button>

            <button onClick={onClose} className="cancel-button">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Place Prediction</h3>
        </div>
        <div className="modal-body">
          <div className="match-section">
            <span className="custom-arena-option-logo">{selectedLabel[0]}</span>
            <div>
              <p className="vs-title">{market.questionText}</p>
              <p className="chosen-team">{selectedLabel}</p>
            </div>
            <div className="prize-pool">
              <p>Prize Pool</p>
              <span>{formatNumber(market.collateralPick ?? 0)} PICK</span>
            </div>
          </div>

          <div className="amount-section">
            <div className="section-header">
              <p>Amount:</p>
              <span>Balance: {formatToTwoDecimals(userBalance)} PICK</span>
            </div>
            <p className="amount-display">{formatToTwoDecimals(amount)} PICK</p>
          </div>

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

          <div className="win-section">
            <div className="section-header">
              <p>To Win:</p>
              <span>Avg. Price: {Math.round(selectedOdds * 100)}</span>
            </div>
            <p className="win-display">{formatToTwoDecimals(potentialWin)} PICK</p>
          </div>

          <button className="confirm-button" onClick={handleConfirm} disabled={isLoading || amount === 0}>
            {isLoading ? 'PROCESSING...' : 'CONFIRM'}
          </button>

          <button onClick={() => setSelectedOption(null)} className="cancel-button">
            Change Outcome
          </button>
        </div>
      </div>
    </div>
  );
}
