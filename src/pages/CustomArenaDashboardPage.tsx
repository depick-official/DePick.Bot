import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CustomArenaCreateModal from '../components/CustomArenaCreateModal';
import CustomArenaMarketCard from '../components/CustomArenaMarketCard';
import CustomArenaPredictionModal from '../components/CustomArenaPredictionModal';
import { customArenaApi } from '../services/api';
import {
  CustomArenaCommunity,
  CustomArenaDashboardResponse,
  CustomArenaMarket,
  CustomArenaScope,
  CustomArenaScopeProvider,
} from '../types/CustomArena';
import '../styles/pages.scss';

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'awaiting_resolution', label: 'Awaiting' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'void', label: 'Void' },
] as const;

type DashboardStatus = (typeof statusFilters)[number]['value'];

export default function CustomArenaDashboardPage() {
  const [searchParams] = useSearchParams();
  const launch = useLaunchContext(searchParams);
  const [communities, setCommunities] = useState<CustomArenaCommunity[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    launch.communityId,
  );
  const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(
    launch.scope ? scopeKey(launch.scope) : null,
  );
  const [status, setStatus] = useState<DashboardStatus>('all');
  const [dashboardData, setDashboard] = useState<CustomArenaDashboardResponse | null>(null);
  const dashboard = dashboardData?.community.id === selectedCommunityId ? dashboardData : null;
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<CustomArenaMarket | null>(null);
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCommunities(true);
    customArenaApi.getModeratorCommunities()
      .then((response) => {
        if (cancelled) return;
        const nextCommunities = response.communities || [];
        setCommunities(nextCommunities);
        setSelectedCommunityId((current) => {
          if (current && nextCommunities.some((community) => community.id === current)) {
            return current;
          }
          if (launch.communityId && nextCommunities.some((community) => community.id === launch.communityId)) {
            return launch.communityId;
          }
          return nextCommunities.length === 1 ? nextCommunities[0].id : null;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Could not load your communities.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCommunities(false);
      });

    return () => {
      cancelled = true;
    };
  }, [launch.communityId]);

  const selectedCommunity = useMemo(
    () => communities.find((community) => community.id === selectedCommunityId) || null,
    [communities, selectedCommunityId],
  );

  useEffect(() => {
    if (!selectedCommunity) {
      setSelectedChannelKey(null);
      return;
    }

    setSelectedChannelKey((current) => {
      if (current && selectedCommunity.channels.some((channel) => scopeKey(channel) === current)) {
        return current;
      }
      const launchChannel = launch.scope && selectedCommunity.channels.find(
        (channel) => scopeKey(channel) === scopeKey(launch.scope!),
      );
      return launch.scope ? scopeKey(launchChannel || selectedCommunity.channels[0]) : null;
    });
  }, [launch.scope, selectedCommunity]);

  useEffect(() => {
    if (!selectedCommunityId) {
      setDashboard(null);
      setIsLoadingDashboard(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDashboard(true);
    setError(null);
    customArenaApi.getModeratorDashboard(
      selectedCommunityId,
      status === 'all' ? undefined : status,
    )
      .then((response) => {
        if (!cancelled) setDashboard(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Could not load this community dashboard.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDashboard(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, selectedCommunityId, status]);

  const selectedChannel = selectedCommunity?.channels.find(
    (channel) => scopeKey(channel) === selectedChannelKey,
  ) || null;
  const counts = dashboard?.counts;
  const canCreate = Boolean(selectedCommunityId && selectedChannel);

  return (
    <div className="container custom-arena-dashboard">
      <div className="header">
        <h1>Custom Arena Dashboard</h1>
        <p>Manage your community markets</p>
      </div>

      {isLoadingCommunities ? (
        <div className="loading">Loading communities...</div>
      ) : communities.length === 0 ? (
        <div className="empty"><p>No moderator communities are available.</p></div>
      ) : (
        <>
          <section className="custom-arena-dashboard-panel custom-arena-dashboard-context">
            <div className="custom-arena-dashboard-selector">
              <label htmlFor="custom-arena-community">Community</label>
              {communities.length > 1 ? (
                <select
                  id="custom-arena-community"
                  value={selectedCommunityId || ''}
                  onChange={(event) => setSelectedCommunityId(event.target.value || null)}
                >
                  {selectedCommunityId === null && <option value="">Select a community</option>}
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>{community.displayName}</option>
                  ))}
                </select>
              ) : (
                <strong>{selectedCommunity?.displayName || 'Community'}</strong>
              )}
            </div>
            <div className="custom-arena-dashboard-selector">
              <label htmlFor="custom-arena-channel">Create in channel</label>
              <select
                id="custom-arena-channel"
                value={selectedChannelKey || ''}
                onChange={(event) => setSelectedChannelKey(event.target.value || null)}
                disabled={!selectedCommunity?.channels.length}
              >
                {!selectedChannelKey && (
                  <option value="">
                    {selectedCommunity?.channels.length ? 'Select a connected channel' : 'No connected channels'}
                  </option>
                )}
                {selectedCommunity?.channels.map((channel) => (
                  <option key={scopeKey(channel)} value={scopeKey(channel)}>
                    {channel.scopeProvider === 'TELEGRAM' ? 'Telegram' : 'Discord'} · {channel.displayName || channel.scopeExternalId}
                  </option>
                ))}
              </select>
            </div>
            {launch.scope && selectedChannel && scopeKey(launch.scope) === scopeKey(selectedChannel) && (
              <p className="custom-arena-dashboard-context-note">
                Launch channel selected from {launch.scope.scopeProvider.toLowerCase()}.
              </p>
            )}
            <button
              type="button"
              className="custom-arena-create custom-arena-dashboard-create"
              onClick={() => setShowCreateModal(true)}
              disabled={!canCreate}
            >
              Create Market
            </button>
          </section>

          {error && !dashboard && <div className="custom-arena-dashboard-error" role="alert">{error}</div>}

          {isLoadingDashboard && !dashboard ? (
            <div className="loading">Loading dashboard...</div>
          ) : dashboard ? (
            <>
              <section className="custom-arena-dashboard-panel" aria-label="Community summary">
                <div className="custom-arena-dashboard-panel-heading">
                  <div>
                    <h2>{dashboard.community.displayName}</h2>
                    <p>
                      {dashboard.community.mode || 'SOCIAL'} · {dashboard.community.status || 'ACTIVE'}
                    </p>
                  </div>
                  <span className="custom-arena-status status-open">{dashboard.community.status || 'ACTIVE'}</span>
                </div>
                <div className="custom-arena-dashboard-stat-grid">
                  <div className="custom-arena-dashboard-stat">
                    <span>Available capacity</span>
                    <strong>{formatPick(dashboard.capacity.availablePick)}</strong>
                    <small>of {formatPick(dashboard.capacity.totalPick)}</small>
                  </div>
                  <div className="custom-arena-dashboard-stat">
                    <span>Committed liquidity</span>
                    <strong>{formatPick(dashboard.capacity.reservedPick)}</strong>
                  </div>
                  <div className="custom-arena-dashboard-stat">
                    <span>Market volume</span>
                    <strong>{formatPick(dashboard.volumePick)}</strong>
                  </div>
                  <div className="custom-arena-dashboard-stat">
                    <span>Participants</span>
                    <strong>{dashboard.participantCount}</strong>
                  </div>
                </div>
              </section>

              <section className="custom-arena-dashboard-panel" aria-label="Market status filters">
                <div className="custom-arena-dashboard-panel-heading">
                  <h2>Market status</h2>
                  <span>{dashboard.markets.length} shown</span>
                </div>
                <div className="custom-arena-dashboard-counts">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={status === filter.value ? 'active' : ''}
                      aria-pressed={status === filter.value}
                      onClick={() => setStatus(filter.value)}
                    >
                      <span>{filter.label}</span>
                      <strong>{filter.value === 'all' ? totalCount(counts) : countForStatus(counts, filter.value)}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="custom-arena-dashboard-markets" aria-label="Community markets" aria-busy={isLoadingDashboard}>
                {error && (
                  <div className="custom-arena-dashboard-error" role="alert">
                    {error} Previous results are still shown.
                  </div>
                )}
                {isLoadingDashboard && (
                  <div className="custom-arena-dashboard-markets-loading" role="status">Loading markets...</div>
                )}
                {dashboard.markets.length === 0 ? (
                  <div className="empty"><p>No markets match this status.</p></div>
                ) : (
                  <div className="custom-arena-list">
                    {dashboard.markets.map((market) => (
                      <CustomArenaMarketCard
                        key={market.id}
                        market={market}
                        showDetails={expandedMarketId === market.id}
                        showReserve
                        onPredict={(selected, option) => {
                          setSelectedMarket(selected);
                          setSelectedOption(option ?? null);
                        }}
                        onToggleDetails={() => setExpandedMarketId((current) =>
                          current === market.id ? null : market.id,
                        )}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </>
      )}

      {showCreateModal && selectedCommunityId && selectedChannel && (
        <CustomArenaCreateModal
          communityId={selectedCommunityId}
          availableCapacityPick={Number(dashboard?.capacity.availablePick ?? 0)}
          scope={selectedChannel}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setReloadKey((current) => current + 1)}
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
          onPredictionSuccess={() => setReloadKey((current) => current + 1)}
        />
      )}
    </div>
  );
}

function useLaunchContext(searchParams: URLSearchParams) {
  return useMemo(() => {
    const provider = readProvider(
      searchParams.get('scope_provider')
      || searchParams.get('scopeProvider')
      || searchParams.get('provider'),
    );
    const externalId = searchParams.get('scope_external_id')
      || searchParams.get('scopeExternalId')
      || searchParams.get('external_channel_id')
      || searchParams.get('externalChannelId')
      || searchParams.get('channel_id')
      || searchParams.get('channelId');
    const displayName = searchParams.get('scope_display_name')
      || searchParams.get('displayName')
      || searchParams.get('channel_name')
      || searchParams.get('channelName')
      || undefined;
    const communityId = searchParams.get('community_id') || searchParams.get('communityId');
    const scope = provider && externalId
      ? { scopeProvider: provider, scopeExternalId: externalId, displayName }
      : null;
    return { communityId, scope };
  }, [searchParams]);
}

function readProvider(value: string | null): CustomArenaScopeProvider | null {
  const provider = value?.toUpperCase();
  return provider === 'TELEGRAM' || provider === 'DISCORD' ? provider : null;
}

function scopeKey(scope?: CustomArenaScope | null) {
  return scope ? `${scope.scopeProvider}:${scope.scopeExternalId}` : '';
}

function countForStatus(
  counts: CustomArenaDashboardResponse['counts'] | undefined,
  status: Exclude<DashboardStatus, 'all'>,
) {
  if (!counts) return 0;
  return counts[status === 'awaiting_resolution'
    ? 'awaitingResolution'
    : status === 'on_hold'
      ? 'onHold'
      : status];
}

function totalCount(counts: CustomArenaDashboardResponse['counts'] | undefined) {
  if (!counts) return 0;
  return counts.active + counts.awaitingResolution + counts.onHold + counts.resolved + counts.void;
}

function formatPick(value: string | number | undefined) {
  if (value === undefined) return '0 PICK';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric)
    ? `${numeric.toLocaleString('en', { maximumFractionDigits: 2 })} PICK`
    : `${value} PICK`;
}

function getApiErrorMessage(err: unknown, fallback: string) {
  const message = (err as {
    response?: { data?: { message?: string | string[] } };
  })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
}
