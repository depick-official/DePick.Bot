import { CustomArenaMarket, CustomArenaVoteValue } from '../types/CustomArena';
import { formatNumber } from '../utils/math';

interface CustomArenaMarketCardProps {
  market: CustomArenaMarket;
  isBusy?: boolean;
  showCreatorDetails?: boolean;
  isCreatorYieldBusy?: boolean;
  onVote: (market: CustomArenaMarket, value: CustomArenaVoteValue) => void;
  onPredict: (market: CustomArenaMarket, option?: 0 | 1) => void;
  onClaim: (market: CustomArenaMarket) => void;
  onToggleDetails?: (market: CustomArenaMarket) => void;
  onClaimCreatorYield?: (market: CustomArenaMarket) => void;
}

export default function CustomArenaMarketCard({
  market,
  isBusy = false,
  showCreatorDetails = false,
  isCreatorYieldBusy = false,
  onVote,
  onPredict,
  onClaim,
  onToggleDetails,
  onClaimCreatorYield,
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
  const liquidityProvided = market.liquidityPICK ?? market.liquidityCreatorPrincipalPick;
  const canClaimCreatorYield = Boolean(market.canClaimCreatorYield && onClaimCreatorYield);

  return (
    <div
      className="custom-arena-card"
      onClick={(event) => {
        if (!onToggleDetails || (event.target as HTMLElement).closest('button')) return;
        onToggleDetails(market);
      }}
    >
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
          Liquidity: <strong>{formatPick(market.collateralPick)}</strong>
        </span>
        <span>
          Upvotes: <strong>{market.upvoteCount}</strong>
        </span>
      </div>

      <div className="custom-arena-choices">
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

      {showCreatorDetails && (
        <div className="custom-arena-creator-details">
          <div>
            <span>Liquidity provided</span>
            <strong>{formatPick(liquidityProvided)}</strong>
          </div>
          <div>
            <span>Market status</span>
            <strong>{market.status}</strong>
          </div>
          <div>
            <span>Resolved outcome</span>
            <strong>{formatOutcome(market)}</strong>
          </div>
          <div>
            <span>Claimable creator yield</span>
            <strong>{formatPick(market.claimableCreatorYieldPick)}</strong>
          </div>
          <div>
            <span>Total creator yield claimed</span>
            <strong>{formatPick(market.liquidityCreatorClaimedPick)}</strong>
          </div>
          <button
            type="button"
            disabled={!canClaimCreatorYield || isCreatorYieldBusy}
            onClick={() => onClaimCreatorYield?.(market)}
          >
            {isCreatorYieldBusy ? 'Claiming...' : 'Claim yield'}
          </button>
        </div>
      )}
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

function formatPick(value?: number) {
  return `${formatNumber(value ?? 0)} PICK`;
}

function formatOutcome(market: CustomArenaMarket) {
  if (market.status !== 'RESOLVED' && market.status !== 'VOID') return 'Pending';
  if (market.status === 'VOID' || market.resolvedOutcome === 256) return 'Unresolvable';
  if (market.resolvedOutcome === 0) return 'Yes';
  if (market.resolvedOutcome === 1) return 'No';
  return 'Pending';
}
