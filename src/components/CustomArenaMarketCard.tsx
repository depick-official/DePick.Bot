import { CustomArenaMarket, CustomArenaVoteValue } from '../types/CustomArena';
import { formatNumber } from '../utils/math';
import CustomArenaMarketTerms from './CustomArenaMarketTerms';

interface CustomArenaMarketCardProps {
  market: CustomArenaMarket;
  isBusy?: boolean;
  showDetails?: boolean;
  showReserve?: boolean;
  onVote?: (market: CustomArenaMarket, value: CustomArenaVoteValue) => void;
  onPredict?: (market: CustomArenaMarket, option?: 0 | 1) => void;
  onClaim?: (market: CustomArenaMarket) => void;
  onToggleDetails?: (market: CustomArenaMarket) => void;
}

export default function CustomArenaMarketCard({
  market,
  isBusy = false,
  showDetails = false,
  showReserve = false,
  onVote,
  onPredict,
  onClaim,
  onToggleDetails,
}: CustomArenaMarketCardProps) {
  const yesOdds = market.odds?.[0];
  const noOdds = market.odds?.[1];
  const hasOdds = typeof yesOdds === 'number' && typeof noOdds === 'number';
  const isOpen = market.status === 'OPEN';
  // CA-ARCH-004 (R6) — a DISPUTED market is On Hold pending manual review: no trade, no
  // claim, and it must NOT read as a final/closed state (FRD "users see a clear hold state").
  const isOnHold = market.status === 'DISPUTED';
  const isClaimable = market.status === 'RESOLVED' || market.status === 'VOID';
  const hasClaimed = market.claimStatus === 'CONFIRMED';
  const canPredict = isOpen
    && hasOdds
    && !isOnHold
    && (market.canPredict ?? !market.createdByMe);
  const canClaim = isClaimable && market.canClaim && !hasClaimed;
  const disabledLabel = !isOpen
    ? 'Market Closed'
    : !hasOdds
      ? 'Odds Loading'
      : !canPredict
        ? 'Position Unavailable'
        : 'Make Prediction';
  const predictionReason = market.canPredictReason
    || (market.createdByMe ? 'You cannot predict your own market.' : null);

  return (
    <div className="custom-arena-card">
      <div className="custom-arena-card-head">
        <span className="custom-arena-date">{formatDeadline(market.resolutionDeadline)}</span>
        {onToggleDetails && (
          <button
            type="button"
            className="custom-arena-info-button"
            aria-label={showDetails ? 'Hide market details' : 'Show market details'}
            aria-expanded={showDetails}
            aria-controls={`market-details-${market.id}`}
            onClick={() => onToggleDetails(market)}
          >
            <span aria-hidden="true">i</span>
          </button>
        )}
      </div>

      <div className="custom-arena-question">
        <h3>{market.questionText}</h3>
        <div className="custom-arena-card-meta">
          {onVote && (
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
          )}
          <span
            className={
              isOnHold
                ? 'custom-arena-status status-onhold'
                : isOpen
                  ? 'custom-arena-status status-open'
                  : 'custom-arena-status'
            }
          >
            {isOnHold ? 'On Hold' : market.status}
          </span>
          {market.groupLabel && <span>{market.groupLabel}</span>}
          {market.sourceChannelName && <span>{market.sourceChannelName}</span>}
          {market.createdByMe && <span>Created by you</span>}
        </div>
      </div>

      <div className="custom-arena-card-info">
        <span>
          Volume: <strong>{market.volumePick === undefined ? 'Unavailable' : formatPick(market.volumePick)}</strong>
        </span>
        {market.participantCount !== undefined ? (
          <span>
            Participants: <strong>{market.participantCount}</strong>
          </span>
        ) : (
          <span>
            Upvotes: <strong>{market.upvoteCount}</strong>
          </span>
        )}
      </div>

      {onPredict && <div className="custom-arena-choices">
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
      </div>}

      {onPredict || onClaim ? <div className="custom-arena-actions">
        {isOnHold ? (
          <button type="button" className="custom-arena-hold-notice" disabled>
            On Hold — manual review pending
          </button>
        ) : isClaimable && onClaim ? (
          <button type="button" disabled={!canClaim || isBusy} onClick={() => onClaim(market)}>
            {hasClaimed ? 'Claimed' : isBusy ? 'Claiming...' : 'Claim'}
          </button>
        ) : (
          <button
            type="button"
            disabled={!onPredict || !canPredict || isBusy}
            onClick={() => onPredict?.(market)}
          >
            {isBusy ? 'Opening...' : disabledLabel}
          </button>
        )}
        {!canPredict && predictionReason && (
          <p className="custom-arena-capability-reason">{predictionReason}</p>
        )}
      </div> : null}

      {showDetails && (
        <div id={`market-details-${market.id}`} className="custom-arena-market-details">
          {showReserve && (
            <div>
              <span>PICK reserve</span>
              <strong>{market.collateralPick === undefined ? 'Unavailable' : formatPick(market.collateralPick)}</strong>
              <p>Held to cover outcome payouts.</p>
            </div>
          )}
          {market.sourceProvider && (
            <div>
              <span>Source</span>
              <strong>{market.sourceProvider}</strong>
            </div>
          )}
          {market.sourceChannelId && (
            <div>
              <span>Channel ID</span>
              <strong>{market.sourceChannelId}</strong>
            </div>
          )}
          <div>
            <span>Market status</span>
            <strong>{market.status}</strong>
          </div>
          <div>
            <span>AI status</span>
            <strong>{market.aiStatus || 'Not provided'}</strong>
          </div>
          <div>
            <span>Resolved result</span>
            <strong>{formatOutcome(market)}</strong>
          </div>
          {market.statusReason && (
            <p className="custom-arena-status-reason">{market.statusReason}</p>
          )}
          <CustomArenaMarketTerms market={market} />
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

function formatPick(value?: number | string) {
  if (value === undefined) return '0 PICK';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? `${formatNumber(numeric)} PICK` : `${value} PICK`;
}

function formatOutcome(market: CustomArenaMarket) {
  if (market.status !== 'RESOLVED' && market.status !== 'VOID') return 'Pending';
  if (market.status === 'VOID' || market.resolvedOutcome === 256) return 'Void';
  if (market.resolvedOutcome === 0) return 'Yes';
  if (market.resolvedOutcome === 1) return 'No';
  return 'Pending';
}
