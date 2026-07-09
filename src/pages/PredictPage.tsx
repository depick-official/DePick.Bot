import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CustomArenaCreateModal from '../components/CustomArenaCreateModal';
import CustomArenaMarketCard from '../components/CustomArenaMarketCard';
import CustomArenaPredictionModal from '../components/CustomArenaPredictionModal';
import PredictionModal from '../components/PredictionModal';
import { customArenaApi, predictionApi } from '../services/api';
import { CustomArenaMarket, CustomArenaScope, CustomArenaVoteValue } from '../types/CustomArena';
import { Prediction } from '../types/Prediction';
import { formatNumber } from '../utils/math';
import '../styles/pages.scss';

type PredictTab = 'public' | 'group' | 'created';

export default function PredictPage() {
  const { matchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupScope = useGroupScope(searchParams);
  const initialTab = parseTab(searchParams.get('tab'), groupScope);
  const shouldOpenCreate = searchParams.get('create') === '1';

  const [activeTab, setActiveTab] = useState<PredictTab>(initialTab);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [groupMarkets, setGroupMarkets] = useState<CustomArenaMarket[]>([]);
  const [createdMarkets, setCreatedMarkets] = useState<CustomArenaMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCustomLoading, setIsCustomLoading] = useState(false);
  const [busyCustomMarketId, setBusyCustomMarketId] = useState<string | null>(null);
  const [busyCreatorYieldMarketId, setBusyCreatorYieldMarketId] = useState<string | null>(null);
  const [expandedCreatorMarketId, setExpandedCreatorMarketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Prediction | null>(null);
  const [selectedCustomMarket, setSelectedCustomMarket] = useState<CustomArenaMarket | null>(null);
  const [selectedCustomOption, setSelectedCustomOption] = useState<0 | 1 | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (matchId) {
          const match = await predictionApi.getPredictionById(matchId);
          setSelectedMatch(match);
          setShowModal(true);
          setPredictions([match]);
          return;
        }

        const data = await predictionApi.getUpcoming();
        setPredictions(data);
      } catch (err) {
        console.error('Failed fetch predictions:', err);
        setError('Failed load predictions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  const fetchCustomMarkets = useCallback(async () => {
    if (matchId) return;

    try {
      setIsCustomLoading(true);
      const [groupData, createdData] = await Promise.all([
        groupScope ? customArenaApi.getGroupMarkets(groupScope) : Promise.resolve([]),
        customArenaApi.getCreatedMarkets(),
      ]);
      setGroupMarkets(groupData);
      setCreatedMarkets(createdData);
    } catch (err) {
      console.error('Failed fetch custom arena markets:', err);
    } finally {
      setIsCustomLoading(false);
    }
  }, [groupScope, matchId]);

  useEffect(() => {
    fetchCustomMarkets();
  }, [fetchCustomMarkets]);

  useEffect(() => {
    if (!groupScope || !shouldOpenCreate) return;
    setActiveTab('group');
    setShowCreateModal(true);
  }, [groupScope, shouldOpenCreate]);

  const handlePredictClick = (match: Prediction) => {
    setSelectedMatch(match);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedMatch(null);

    if (matchId) {
      navigate('/predict');
    }
  };

  const handlePredictionSuccess = async () => {
    try {
      const data = await predictionApi.getUpcoming();
      setPredictions(data);
    } catch (err) {
      console.error('Failed refresh predictions:', err);
    }
  };

  const patchMarket = (id: string, patch: Partial<CustomArenaMarket>) => {
    const applyPatch = (market: CustomArenaMarket) =>
      market.id === id ? { ...market, ...patch } : market;
    setGroupMarkets((markets) => markets.map(applyPatch));
    setCreatedMarkets((markets) => markets.map(applyPatch));
  };

  const handleCustomVote = async (
    market: CustomArenaMarket,
    value: CustomArenaVoteValue,
  ) => {
    const nextVote = market.userVote === value ? 0 : value;
    const voteScore = market.voteScore + nextVote - market.userVote;
    const upvoteCount =
      market.upvoteCount + voteCountDelta(market.userVote, nextVote, 1);
    const downvoteCount =
      market.downvoteCount + voteCountDelta(market.userVote, nextVote, -1);

    patchMarket(market.id, {
      userVote: nextVote,
      voteScore,
      upvoteCount,
      downvoteCount,
    });

    try {
      const response = await customArenaApi.voteMarket(market.id, value);
      patchMarket(market.id, response);
    } catch (err) {
      console.error('Failed vote custom arena market:', err);
      fetchCustomMarkets();
    }
  };

  const handleCustomPredict = (market: CustomArenaMarket, option: 0 | 1 | null = null) => {
    setSelectedCustomOption(option);
    setSelectedCustomMarket(market);
  };

  const handleCustomClaim = async (market: CustomArenaMarket) => {
    try {
      setBusyCustomMarketId(market.id);
      await customArenaApi.claimMarket(market.id);
      alert('Claim submitted.');
      fetchCustomMarkets();
    } catch (err) {
      console.error('Failed claim custom arena market:', err);
      alert('Claim is not available yet.');
    } finally {
      setBusyCustomMarketId(null);
    }
  };

  const handleClaimCreatorYield = async (market: CustomArenaMarket) => {
    try {
      setBusyCreatorYieldMarketId(market.id);
      await customArenaApi.claimCreatorYield(market.id);
      alert('Creator yield claim submitted.');
      fetchCustomMarkets();
    } catch (err) {
      console.error('Failed claim custom arena creator yield:', err);
      alert('Creator yield is not available yet.');
    } finally {
      setBusyCreatorYieldMarketId(null);
    }
  };

  const handleCreateClick = () => {
    if (groupScope) setShowCreateModal(true);
  };

  const handleLeaderboardClick = () => {
    navigate('/leaderboard?provider=TELEGRAM');
  };

  const handleCreated = async () => {
    await fetchCustomMarkets();
    setActiveTab('created');
  };

  const renderPublic = () => {
    if (matchId && !showModal && isLoading) return <div className="loading">Loading match...</div>;

    if (isLoading) return <div className="loading">Loading predictions...</div>;

    if (predictions.length === 0) {
      return (
        <div className="empty">
          <p>No upcoming matches available</p>
        </div>
      );
    }

    if (matchId) return null;

    return (
      <div className="match-list">
        {predictions.map((match) => (
          <div key={match.id} className="match-card" onClick={() => handlePredictClick(match)}>
            <div className="match-date">
              {formatDate(match.datetime)} - {formatTime(match.datetime)}
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
            <button className="predict-button">Make Prediction</button>
          </div>
        ))}
      </div>
    );
  };

  const renderCustomList = (
    markets: CustomArenaMarket[],
    emptyText: string,
    options?: { creatorDetails?: boolean },
  ) => {
    if (isCustomLoading) return <div className="loading">Loading markets...</div>;

    if (markets.length === 0) {
      return (
        <div className="empty">
          <p>{emptyText}</p>
        </div>
      );
    }

    return (
      <div className="custom-arena-list">
        {markets.map((market) => (
          <CustomArenaMarketCard
            key={market.id}
            market={market}
            isBusy={busyCustomMarketId === market.id}
            showCreatorDetails={options?.creatorDetails && expandedCreatorMarketId === market.id}
            isCreatorYieldBusy={busyCreatorYieldMarketId === market.id}
            onVote={handleCustomVote}
            onPredict={handleCustomPredict}
            onClaim={handleCustomClaim}
            onToggleDetails={
              options?.creatorDetails
                ? () =>
                    setExpandedCreatorMarketId((current) =>
                      current === market.id ? null : market.id,
                    )
                : undefined
            }
            onClaimCreatorYield={options?.creatorDetails ? handleClaimCreatorYield : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Predictions</h1>
        <p>Make predictions and earn PICK</p>
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          {!matchId && (
            <>
              <button
                type="button"
                className="predict-leaderboard-cta"
                onClick={handleLeaderboardClick}
              >
                View Leaderboard
              </button>

              <div className="predict-toolbar">
                <div className="predict-tabs" role="tablist" aria-label="Prediction tabs">
                <button
                  type="button"
                  className={activeTab === 'public' ? 'active' : ''}
                  onClick={() => setActiveTab('public')}
                >
                  Public
                </button>
                <button
                  type="button"
                  className={activeTab === 'group' ? 'active' : ''}
                  onClick={() => setActiveTab('group')}
                >
                  Group
                </button>
                <button
                  type="button"
                  className={activeTab === 'created' ? 'active' : ''}
                  onClick={() => setActiveTab('created')}
                >
                  Created
              </button>
            </div>

            <div className="custom-arena-create-wrap">
                <button
                  type="button"
                  className="custom-arena-create"
                  onClick={handleCreateClick}
                  disabled={!groupScope}
                  aria-describedby={!groupScope ? 'custom-arena-lock-tip' : undefined}
                >
                  {!groupScope && <span className="lock-icon">i</span>}
                  Create
                </button>
                {!groupScope && (
                  <span id="custom-arena-lock-tip" className="custom-arena-tooltip">
                    Start from a group to play with friends.
                  </span>
                )}
              </div>
              </div>
            </>
          )}

          {activeTab === 'public' && renderPublic()}
          {activeTab === 'group' &&
            (groupScope
              ? renderCustomList(groupMarkets, 'No group markets yet.')
              : renderCustomList([], 'Open from a group to unlock Custom Arena.'))}
              {activeTab === 'created' &&
                renderCustomList(createdMarkets, 'No created markets yet.', {
                  creatorDetails: true,
                })}
        </>
      )}

      {showModal && selectedMatch && (
        <PredictionModal
          match={selectedMatch}
          onClose={handleModalClose}
          onPredictionSuccess={handlePredictionSuccess}
        />
      )}

      {showCreateModal && groupScope && (
        <CustomArenaCreateModal
          scope={groupScope}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedCustomMarket && (
        <CustomArenaPredictionModal
          market={selectedCustomMarket}
          initialOption={selectedCustomOption}
          onClose={() => {
            setSelectedCustomMarket(null);
            setSelectedCustomOption(null);
          }}
          onPredictionSuccess={fetchCustomMarkets}
        />
      )}
    </div>
  );
}

function useGroupScope(searchParams: URLSearchParams): CustomArenaScope | null {
  return useMemo(() => {
    const provider =
      searchParams.get('scope_provider') || searchParams.get('scopeProvider');
    const externalId =
      searchParams.get('scope_external_id') || searchParams.get('scopeExternalId');
    const displayName =
      searchParams.get('scope_display_name') || searchParams.get('displayName') || undefined;

    if ((provider !== 'TELEGRAM' && provider !== 'DISCORD') || !externalId) {
      return null;
    }

    return {
      scopeProvider: provider,
      scopeExternalId: externalId,
      displayName,
    };
  }, [searchParams]);
}

function parseTab(value: string | null, groupScope: CustomArenaScope | null): PredictTab {
  if (value === 'group' && groupScope) return 'group';
  if (value === 'created') return 'created';
  return 'public';
}

function voteCountDelta(oldValue: number, newValue: number, target: 1 | -1) {
  return (newValue === target ? 1 : 0) - (oldValue === target ? 1 : 0);
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
