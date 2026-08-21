import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CustomArenaCreateModal from '../components/CustomArenaCreateModal';
import CustomArenaMarketCard from '../components/CustomArenaMarketCard';
import CustomArenaPredictionModal from '../components/CustomArenaPredictionModal';
import { customArenaApi } from '../services/api';
import { CustomArenaMarket, CustomArenaScope, CustomArenaVoteValue } from '../types/CustomArena';
import '../styles/pages.scss';

type CustomArenaTab = 'group' | 'created' | 'history';

export default function CustomArenaPage() {
  const [searchParams] = useSearchParams();
  const groupScope = useGroupScope(searchParams);
  const shouldOpenCreate = searchParams.get('create') === '1';
  const [activeTab, setActiveTab] = useState<CustomArenaTab>(parseTab(searchParams.get('tab')));
  const [markets, setMarkets] = useState<CustomArenaMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyMarketId, setBusyMarketId] = useState<string | null>(null);
  const [busyCreatorYieldMarketId, setBusyCreatorYieldMarketId] = useState<string | null>(null);
  const [expandedCreatorMarketId, setExpandedCreatorMarketId] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<CustomArenaMarket | null>(null);
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchMarkets = useCallback(async () => {
    if (activeTab !== 'created' && !groupScope) {
      setMarkets([]);
      return;
    }

    try {
      setIsLoading(true);
      const data = activeTab === 'created'
        ? await customArenaApi.getCreatedMarkets()
        : await customArenaApi.getGroupMarkets(
            groupScope!,
            activeTab === 'history' ? 'history' : 'active',
          );
      setMarkets(data);
    } catch (err) {
      console.error('Failed fetch custom arena markets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, groupScope]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    if (groupScope && shouldOpenCreate) setShowCreateModal(true);
  }, [groupScope, shouldOpenCreate]);

  const patchMarket = (id: string, patch: Partial<CustomArenaMarket>) => {
    setMarkets((current) => current.map((market) =>
      market.id === id ? { ...market, ...patch } : market,
    ));
  };

  const handleVote = async (market: CustomArenaMarket, value: CustomArenaVoteValue) => {
    const nextVote = market.userVote === value ? 0 : value;
    patchMarket(market.id, {
      userVote: nextVote,
      voteScore: market.voteScore + nextVote - market.userVote,
      upvoteCount: market.upvoteCount + voteCountDelta(market.userVote, nextVote, 1),
      downvoteCount: market.downvoteCount + voteCountDelta(market.userVote, nextVote, -1),
    });

    try {
      patchMarket(market.id, await customArenaApi.voteMarket(market.id, value));
    } catch (err) {
      console.error('Failed vote custom arena market:', err);
      fetchMarkets();
    }
  };

  const handleClaim = async (market: CustomArenaMarket) => {
    try {
      setBusyMarketId(market.id);
      await customArenaApi.claimMarket(market.id);
      alert('Claim submitted.');
      fetchMarkets();
    } catch (err) {
      console.error('Failed claim custom arena market:', err);
      alert('Claim is not available yet.');
    } finally {
      setBusyMarketId(null);
    }
  };

  const handleClaimCreatorYield = async (market: CustomArenaMarket) => {
    try {
      setBusyCreatorYieldMarketId(market.id);
      await customArenaApi.claimCreatorYield(market.id);
      alert('Creator yield claim submitted.');
      fetchMarkets();
    } catch (err) {
      console.error('Failed claim custom arena creator yield:', err);
      alert('Creator yield is not available yet.');
    } finally {
      setBusyCreatorYieldMarketId(null);
    }
  };

  const emptyText = !groupScope && activeTab !== 'created'
    ? 'Open from a group to unlock Custom Arena.'
    : activeTab === 'created'
      ? 'No created markets yet.'
      : activeTab === 'history'
        ? 'No resolved markets yet.'
        : 'No active group markets yet.';

  return (
    <div className="container">
      <div className="header">
        <h1>Custom Arena</h1>
        <p>Create and predict with your community</p>
      </div>

      <div className="predict-toolbar">
        <div className="predict-tabs" role="tablist" aria-label="Custom Arena tabs">
          {(['group', 'created', 'history'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="custom-arena-create-wrap">
          <button
            type="button"
            className="custom-arena-create"
            onClick={() => groupScope && setShowCreateModal(true)}
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

      {isLoading ? (
        <div className="loading">Loading markets...</div>
      ) : markets.length === 0 ? (
        <div className="empty"><p>{emptyText}</p></div>
      ) : (
        <div className="custom-arena-list">
          {markets.map((market) => (
            <CustomArenaMarketCard
              key={market.id}
              market={market}
              isBusy={busyMarketId === market.id}
              showCreatorDetails={
                activeTab === 'created' && expandedCreatorMarketId === market.id
              }
              isCreatorYieldBusy={busyCreatorYieldMarketId === market.id}
              onVote={handleVote}
              onPredict={(selected, option) => {
                setSelectedMarket(selected);
                setSelectedOption(option ?? null);
              }}
              onClaim={handleClaim}
              onToggleDetails={activeTab === 'created'
                ? () => setExpandedCreatorMarketId((current) =>
                    current === market.id ? null : market.id,
                  )
                : undefined}
              onClaimCreatorYield={
                activeTab === 'created' ? handleClaimCreatorYield : undefined
              }
            />
          ))}
        </div>
      )}

      {showCreateModal && groupScope && (
        <CustomArenaCreateModal
          scope={groupScope}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setActiveTab('created');
          }}
        />
      )}

      {selectedMarket && (
        <CustomArenaPredictionModal
          market={selectedMarket}
          initialOption={selectedOption}
          onClose={() => {
            setSelectedMarket(null);
            setSelectedOption(null);
          }}
          onPredictionSuccess={fetchMarkets}
        />
      )}
    </div>
  );
}

function useGroupScope(searchParams: URLSearchParams): CustomArenaScope | null {
  return useMemo(() => {
    const provider = searchParams.get('scope_provider') || searchParams.get('scopeProvider');
    const scopeExternalId =
      searchParams.get('scope_external_id') || searchParams.get('scopeExternalId');
    const displayName =
      searchParams.get('scope_display_name') || searchParams.get('displayName') || undefined;

    if ((provider !== 'TELEGRAM' && provider !== 'DISCORD') || !scopeExternalId) return null;
    return { scopeProvider: provider, scopeExternalId, displayName };
  }, [searchParams]);
}

function parseTab(value: string | null): CustomArenaTab {
  return value === 'created' || value === 'history' ? value : 'group';
}

function voteCountDelta(oldValue: number, newValue: number, target: 1 | -1) {
  return (newValue === target ? 1 : 0) - (oldValue === target ? 1 : 0);
}
