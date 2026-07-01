import { CustomArenaMarket, CustomArenaVoteValue } from '../types/CustomArena';
import { formatNumber } from '../utils/math';

interface CustomArenaMarketCardProps {
  market: CustomArenaMarket;
  isBusy?: boolean;
  onVote: (market: CustomArenaMarket, value: CustomArenaVoteValue) => void;
  onPredict: (market: CustomArenaMarket, option?: 0 | 1) => void;
  onClaim: (market: CustomArenaMarket) => void;
}

export default function CustomArenaMarketCard({
  market,
  isBusy = false,
  onVote,
  onPredict,
  onClaim,
}: CustomArenaMarketCardProps) {
  const yesOdds = market.odds?.[0];
  const noOdds = market.odds?.[1];
  const hasOdds = typeof yesOdds === 'number' && typeof noOdds === 'number';
  const isOpen = market.status === 'OPEN';
  const isClaimable = market.status === 'RESOLVED' || market.status === 'VOID';
  const hasClaimed = market.claimStatus === 'CONFIRMED';
  const canPredict = isOpen && hasOdds;
  const canClaim = isClaimable && market.canClaim && !hasClaimed;
  const disabledLabel = !isOpen ? 'Market Closed' : !hasOdds ? 'Odds Loading' : 'Make Prediction';

  return (
    <div className="custom-arena-card">
      <div className="custom-arena-card-head">
        <span className="custom-arena-date">{formatDeadline(market.resolutionDeadline)}</span>
      </div>

      <div className="custom-arena-question">
        <h3>{market.questionText}</h3>
        <div className="custom-arena-card-meta">
          <div className="custom-arena-vote-pill" aria-label="Market votes">
              <button
                type="button"
                className={market.userVote === 1 ? 'active' : ''}
                onClick={() => onVote(market, 1)}
                aria-label="Upvote market"
              >
                <span className="custom-arena-arrow" aria-hidden="true">↑</span>
              </button>
            <strong>{market.voteScore}</strong>
              <button
                type="button"
                className={market.userVote === -1 ? 'active' : ''}
                onClick={() => onVote(market, -1)}
                aria-label="Downvote market"
              >
                <span className="custom-arena-arrow" aria-hidden="true">↓</span>
              </button>
          </div>
          <span className={isOpen ? 'custom-arena-status status-open' : 'custom-arena-status'}>
            {market.status}
          </span>
          {market.groupLabel && <span>{market.groupLabel}</span>}
          {market.createdByMe && <span>Created by you</span>}
        </div>
      </div>

      <div className="custom-arena-card-info">
        <span>
          Liquidity: <strong>{formatNumber(market.collateralPick || 0)} PICK</strong>
        </span>
        <span>
          Upvotes: <strong>{market.upvoteCount}</strong>
        </span>
      </div>

      <div className="custom-arena-prediction-stack">
        <div className="custom-arena-outcomes" aria-label="Market odds">
          <div className="custom-arena-choice">
            <button
              type="button"
              className="custom-arena-choice-button choice-yes"
              disabled={!canPredict || isBusy}
              onClick={() => onPredict(market, 0)}
            >
              Yes
            </button>
            <span>{hasOdds ? `${formatNumber(yesOdds * 100)}%` : 'Odds loading'}</span>
          </div>
          <div className="custom-arena-choice">
            <button
              type="button"
              className="custom-arena-choice-button choice-no"
              disabled={!canPredict || isBusy}
              onClick={() => onPredict(market, 1)}
            >
              No
            </button>
            <span>{hasOdds ? `${formatNumber(noOdds * 100)}%` : 'Odds loading'}</span>
          </div>
        </div>

        <div className="custom-arena-actions">
          {isClaimable ? (
            <button type="button" disabled={!canClaim || isBusy} onClick={() => onClaim(market)}>
              {hasClaimed ? 'Claimed' : isBusy ? 'Claiming...' : 'Claim'}
            </button>
          ) : (
            <button type="button" disabled={!canPredict || isBusy} onClick={() => onPredict(market)}>
              {isBusy ? 'Opening...' : disabledLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDeadline(value: string) {
  return new Date(value).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
