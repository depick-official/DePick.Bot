import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { officePoolApi, telegramAuthApi } from '../services/api';
import { tokenUtils } from '../utils/token';
import {
  CreateOfficePoolRequest,
  OfficePoolLeaderboardResponse,
  OfficePoolMemberSummary,
  OfficePoolMode,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
} from '../types/OfficePool';
import '../styles/pages.scss';

interface DecodedToken {
  sub?: string;
}

interface TeamOption {
  id: string;
  name: string;
  logo: string;
}

interface TelegramAuthQueryData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramWebAppState {
  initData?: string;
  startParam?: string;
}

interface WorldCupModeConfig {
  mode: OfficePoolMode;
  title: string;
  badge: string;
  description: string;
  championLabel: string;
  startsAt: string;
  endsAt: string;
}

const CHAMPION_SIDE_PICK_KEY = 'CHAMPION';

type Screen = 'home' | 'create' | 'detail' | 'picks';

function startOfDayIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toISOString();
}

function endOfDayIso(value: string) {
  const date = new Date(`${value}T23:59:59`);
  return date.toISOString();
}

const WORLD_CUP_MODE_CONFIG: WorldCupModeConfig[] = [
  {
    mode: 'WORLD_CUP_GROUP_STAGE',
    title: 'World Cup Group Stage',
    badge: 'Incoming',
    description: 'Play the 2026 World Cup opening phase with group-stage match picks and an early champion pick.',
    championLabel: 'Champion pick opens the pool. Group qualifiers will replace this with a fuller flow later.',
    startsAt: '2026-06-11',
    endsAt: '2026-06-27',
  },
  {
    mode: 'WORLD_CUP_KNOCKOUT_STAGE',
    title: 'World Cup Knockout Stage',
    badge: 'Incoming',
    description: 'Run a knockout-only pool once the bracket begins, with high-stakes match picks and later podium picks.',
    championLabel: 'Champion pick is kept for the join flow now. Later this becomes top 1, 2, 3.',
    startsAt: '2026-06-28',
    endsAt: '2026-07-19',
  },
];

const WORLD_CUP_MODE_CONFIG_MAP = Object.fromEntries(
  WORLD_CUP_MODE_CONFIG.map((item) => [item.mode, item]),
) as Record<OfficePoolMode, WorldCupModeConfig>;

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getModeLabel(mode: OfficePoolMode) {
  return WORLD_CUP_MODE_CONFIG_MAP[mode]?.title ?? mode;
}

function getPickLabel(option: OfficePoolPickOption) {
  switch (option) {
    case 'HOME':
      return 'Home';
    case 'DRAW':
      return 'Draw';
    case 'AWAY':
      return 'Away';
  }
}

function pickFromResult(result: string): OfficePoolPickOption | null {
  if (result === 'HOME') return 'HOME';
  if (result === 'AWAY') return 'AWAY';
  if (result === 'TIE') return 'DRAW';
  return null;
}

function buildChampionTeams(predictions: OfficePoolPredictionSummary[]): TeamOption[] {
  const byId = new Map<string, TeamOption>();
  predictions.forEach((match) => {
    if (!byId.has(match.homeTeamId)) {
      byId.set(match.homeTeamId, {
        id: match.homeTeamId,
        name: match.homeTeamName,
        logo: match.homeTeamLogo,
      });
    }
    if (!byId.has(match.awayTeamId)) {
      byId.set(match.awayTeamId, {
        id: match.awayTeamId,
        name: match.awayTeamName,
        logo: match.awayTeamLogo,
      });
    }
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getChampionSidePick(sidePicks: OfficePoolSidePickSummary[]) {
  return sidePicks.find((sidePick) => sidePick.type === 'CHAMPION' && sidePick.key === CHAMPION_SIDE_PICK_KEY) ?? null;
}

function getTelegramAuthQueryData(searchParams: URLSearchParams): TelegramAuthQueryData | null {
  const id = searchParams.get('id');
  const firstName = searchParams.get('first_name');
  const authDate = searchParams.get('auth_date');
  const hash = searchParams.get('hash');

  if (!id || !firstName || !authDate || !hash) {
    return null;
  }

  return {
    id: Number(id),
    first_name: firstName,
    last_name: searchParams.get('last_name') ?? undefined,
    username: searchParams.get('username') ?? undefined,
    photo_url: searchParams.get('photo_url') ?? undefined,
    auth_date: Number(authDate),
    hash,
  };
}

function buildOfficePoolSearch(scopeProvider?: string, scopeExternalId?: string) {
  const nextParams = new URLSearchParams();
  if (scopeProvider) {
    nextParams.set('scope_provider', scopeProvider);
  }
  if (scopeExternalId) {
    nextParams.set('scope_external_id', scopeExternalId);
  }
  const nextQuery = nextParams.toString();
  return nextQuery ? `?${nextQuery}` : '';
}

function getTelegramWebAppState(searchParams: URLSearchParams): TelegramWebAppState {
  const telegramWebApp = (globalThis as any).Telegram?.WebApp;
  const initData = typeof telegramWebApp?.initData === 'string' && telegramWebApp.initData.length > 0
    ? telegramWebApp.initData
    : undefined;
  const startParamFromInit = typeof telegramWebApp?.initDataUnsafe?.start_param === 'string' && telegramWebApp.initDataUnsafe.start_param.length > 0
    ? telegramWebApp.initDataUnsafe.start_param
    : undefined;
  const startParamFromQuery = searchParams.get('tgWebAppStartParam') ?? undefined;

  return {
    initData,
    startParam: startParamFromInit ?? startParamFromQuery,
  };
}

function parseOfficePoolScopeFromStartParam(startParam?: string) {
  if (!startParam || !startParam.startsWith('officepool_')) {
    return { scopeProvider: undefined, scopeExternalId: undefined };
  }

  const scopeExternalId = startParam.slice('officepool_'.length);
  if (!scopeExternalId) {
    return { scopeProvider: undefined, scopeExternalId: undefined };
  }

  return {
    scopeProvider: 'TELEGRAM',
    scopeExternalId,
  };
}

export default function OfficePoolPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('home');
  const [authReady, setAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [allPools, setAllPools] = useState<OfficePoolSummary[]>([]);
  const [myPools, setMyPools] = useState<OfficePoolSummary[]>([]);
  const [activePoolId, setActivePoolId] = useState('');
  const [activePool, setActivePool] = useState<OfficePoolSummary | null>(null);
  const [poolReloadToken, setPoolReloadToken] = useState(0);
  const [members, setMembers] = useState<OfficePoolMemberSummary[]>([]);
  const [predictions, setPredictions] = useState<OfficePoolPredictionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<OfficePoolLeaderboardResponse | null>(null);
  const [picks, setPicks] = useState<Record<string, OfficePoolPickOption>>({});
  const [sidePicks, setSidePicks] = useState<OfficePoolSidePickSummary[]>([]);
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [selectedChampionPick, setSelectedChampionPick] = useState('');
  const [confirmedChampionPickId, setConfirmedChampionPickId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(tokenUtils.getToken());

  const [createName, setCreateName] = useState('');
  const [createMode, setCreateMode] = useState<OfficePoolMode>('WORLD_CUP_GROUP_STAGE');
  const [createEntryFee, setCreateEntryFee] = useState('10');
  const [createSubmitAttempted, setCreateSubmitAttempted] = useState(false);
  const [createNameTouched, setCreateNameTouched] = useState(false);
  const [createEntryFeeTouched, setCreateEntryFeeTouched] = useState(false);

  const authToken = searchParams.get('auth_token');
  const telegramAuthQueryData = useMemo(() => getTelegramAuthQueryData(searchParams), [searchParams]);
  const telegramWebAppState = useMemo(() => getTelegramWebAppState(searchParams), [searchParams]);
  const startParamScope = useMemo(
    () => parseOfficePoolScopeFromStartParam(telegramWebAppState.startParam),
    [telegramWebAppState.startParam],
  );
  const scopeProvider = searchParams.get('scope_provider') ?? startParamScope.scopeProvider;
  const scopeExternalId = searchParams.get('scope_external_id') ?? startParamScope.scopeExternalId;
  const isScopedLaunch = !!scopeProvider && !!scopeExternalId;

  const currentUserId = useMemo(() => {
    const token = sessionToken ?? tokenUtils.getToken();
    if (!token) return undefined;
    try {
      return jwtDecode<DecodedToken>(token).sub;
    } catch {
      return undefined;
    }
  }, [sessionToken]);

  const discoverPools = useMemo(
    () => allPools.filter((pool) => !myPools.some((mine) => mine.id === pool.id)),
    [allPools, myPools],
  );
  const championTeams = useMemo(() => buildChampionTeams(predictions), [predictions]);
  const myMember = useMemo(
    () => members.find((member) => member.userId === currentUserId) ?? null,
    [members, currentUserId],
  );
  const sharedRanks = useMemo(() => {
    const counts = new Map<number, number>();
    leaderboard?.leaderboard.forEach((entry) => {
      counts.set(entry.rank, (counts.get(entry.rank) ?? 0) + 1);
    });
    return counts;
  }, [leaderboard]);

  const createModeConfig = WORLD_CUP_MODE_CONFIG_MAP[createMode];
  const createStart = createModeConfig.startsAt;
  const createEnd = createModeConfig.endsAt;

  const createNameError = useMemo(() => {
    if (!createSubmitAttempted && !createNameTouched) return null;
    return createName.trim() ? null : 'Pool name is required.';
  }, [createName, createNameTouched, createSubmitAttempted]);
  const createEntryFeeError = useMemo(() => {
    if (!createSubmitAttempted && !createEntryFeeTouched) return null;
    const value = Number(createEntryFee);
    if (!Number.isFinite(value) || value <= 0) {
      return 'Minimum entry fee must be greater than 0 PICK.';
    }
    return null;
  }, [createEntryFee, createEntryFeeTouched, createSubmitAttempted]);
  const createWindowDays = useMemo(() => {
    const start = new Date(startOfDayIso(createStart));
    const end = new Date(endOfDayIso(createEnd));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return null;
    }
    return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }, [createEnd, createStart]);
  const createWindowLabel = `${formatDate(createStart)} - ${formatDate(createEnd)}`;

  useEffect(() => {
    const telegramWebApp = (globalThis as any).Telegram?.WebApp;
    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveOfficePoolSession = async () => {
      try {
        setError(null);

        let nextToken = tokenUtils.getToken();
        const requiresScopedTelegramAuth = isScopedLaunch;

        if (authToken) {
          tokenUtils.setToken(authToken, 'TELEGRAM');
          nextToken = authToken;
        } else if (telegramAuthQueryData) {
          const authResponse = await telegramAuthApi.verify(telegramAuthQueryData);
          tokenUtils.setToken(authResponse.auth_token, 'TELEGRAM');
          nextToken = authResponse.auth_token;
        } else if (telegramWebAppState.initData) {
          const authResponse = await telegramAuthApi.verifyMiniApp({ initData: telegramWebAppState.initData });
          tokenUtils.setToken(authResponse.auth_token, 'TELEGRAM');
          nextToken = authResponse.auth_token;
        } else if (requiresScopedTelegramAuth) {
          tokenUtils.removeToken();
          throw new Error('Missing Telegram Mini App session. Re-open Office Pool from Telegram.');
        } else if (!tokenUtils.isTokenValid()) {
          throw new Error('Missing authentication token');
        } else {
          nextToken = tokenUtils.getToken();
        }

        if (!nextToken) {
          throw new Error('Missing authentication token');
        }

        if (cancelled) return;

        setSessionToken((current) => (current === nextToken ? current : nextToken));
        setAuthReady(true);

        if (authToken || telegramAuthQueryData || telegramWebAppState.initData) {
          navigate(
            {
              pathname: '/office-pool',
              search: buildOfficePoolSearch(scopeProvider, scopeExternalId),
            },
            { replace: true },
          );
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load office pools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load office pools');
        setSessionToken(null);
        setAuthReady(true);
        setIsLoading(false);
      }
    };

    void resolveOfficePoolSession();

    return () => {
      cancelled = true;
    };
  }, [
    authToken,
    isScopedLaunch,
    navigate,
    scopeExternalId,
    scopeProvider,
    telegramAuthQueryData,
    telegramWebAppState.initData,
  ]);

  useEffect(() => {
    if (!authReady || !sessionToken) {
      return;
    }

    let cancelled = false;

    const refreshOfficePoolHome = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [mine, all] = await Promise.all([
          officePoolApi.listMine(),
          isScopedLaunch
            ? officePoolApi.list({ scopeProvider, scopeExternalId })
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setMyPools(mine);
        setAllPools(all);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to refresh office pools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load office pools');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void refreshOfficePoolHome();

    return () => {
      cancelled = true;
    };
  }, [authReady, isScopedLaunch, scopeExternalId, scopeProvider, sessionToken]);

  useEffect(() => {
    if (!activePoolId || (screen !== 'detail' && screen !== 'picks')) return;

    const loadPoolContext = async () => {
      try {
        setError(null);
        const pool = await officePoolApi.getById(activePoolId);

        setActivePool(pool);

        if (pool.isMember) {
          const [nextPredictions, nextMembers, nextLeaderboard, nextPicks, nextSidePicks] = await Promise.all([
            officePoolApi.getPredictions(activePoolId),
            officePoolApi.getMembers(activePoolId),
            officePoolApi.getLeaderboard(activePoolId),
            officePoolApi.getPicks(activePoolId).catch(() => ({})),
            officePoolApi.getSidePicks(activePoolId).catch(() => []),
          ]);
          setPredictions(nextPredictions);
          setMembers(nextMembers);
          setLeaderboard(nextLeaderboard);
          setPicks(nextPicks);
          setSidePicks(nextSidePicks);
        } else {
          const nextPredictions = await officePoolApi.getPredictions(activePoolId).catch(() => []);
          setPredictions(nextPredictions);
          setMembers([]);
          setLeaderboard(null);
          setPicks({});
          setSidePicks([]);
        }
      } catch (err) {
        console.error('Failed to load office pool details:', err);
        setError('Failed to load office pool details');
      } finally {
      }
    };

    void loadPoolContext();
  }, [activePoolId, poolReloadToken, screen]);

  useEffect(() => {
    const championSidePick = getChampionSidePick(sidePicks);
    if (championSidePick) {
      setSelectedChampionPick(championSidePick.teamId);
      setConfirmedChampionPickId(championSidePick.teamId);
      return;
    }

    if (!myMember?.championPickTeamId) return;
    setSelectedChampionPick(myMember.championPickTeamId);
    setConfirmedChampionPickId(myMember.championPickTeamId);
  }, [myMember?.championPickTeamId, sidePicks]);

  const refreshHome = async () => {
    const [mine, all] = await Promise.all([
      officePoolApi.listMine(),
      isScopedLaunch
        ? officePoolApi.list({ scopeProvider, scopeExternalId })
        : Promise.resolve([]),
    ]);
    setMyPools(mine);
    setAllPools(all);
  };

  const refreshHomeInBackground = () => {
    void refreshHome().catch((err) => {
      console.error('Failed to refresh office pool home state:', err);
    });
  };

  const openPool = (poolId: string, nextScreen: Screen = 'detail') => {
    setActivePoolId(poolId);
    setPoolReloadToken((current) => current + 1);
    setSelectedChampionPick('');
    setConfirmedChampionPickId(null);
    setSidePicks([]);
    setScreen(nextScreen);
    setError(null);
  };

  const handleInviteLookup = async () => {
    try {
      setError(null);
      setNotice(null);
      const code = joinInviteCode.trim().toUpperCase();
      if (!code) return;
      const pool = await officePoolApi.getByInviteCode(code);
      setJoinInviteCode(code);
      openPool(pool.id, 'detail');
    } catch (err: any) {
      console.error('Failed to find office pool by invite:', err);
      setError(err?.response?.data?.message ?? 'Invite code not found');
    }
  };

  const handleCreatePool = async () => {
    try {
      setError(null);
      setNotice(null);
      setIsSaving(true);
      setCreateSubmitAttempted(true);
      const trimmedName = createName.trim();
      const entryFee = Number(createEntryFee);
      if (!trimmedName) {
        throw new Error('Pool name is required');
      }
      if (!Number.isFinite(entryFee) || entryFee <= 0) {
        throw new Error('Minimum entry fee must be greater than 0 PICK');
      }
      if (new Date(startOfDayIso(createStart)) >= new Date(endOfDayIso(createEnd))) {
        throw new Error('End date must be after the start date');
      }
      const payload: CreateOfficePoolRequest = {
        name: trimmedName,
        mode: createMode,
        tournament: 'WORLD_CUP',
        seasonKey: '2026',
        startsAt: startOfDayIso(createStart),
        endsAt: endOfDayIso(createEnd),
        scopeProvider,
        scopeExternalId,
        entryFee,
      };

      const pool = await officePoolApi.create(payload);
      setCreateName('');
      setCreateMode('WORLD_CUP_GROUP_STAGE');
      setCreateEntryFee('10');
      setCreateSubmitAttempted(false);
      setCreateNameTouched(false);
      setCreateEntryFeeTouched(false);
      openPool(pool.id, 'detail');
      setNotice(`Created ${pool.name}. Set your champion pick next.`);
      refreshHomeInBackground();
    } catch (err: any) {
      console.error('Failed to create office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to create office pool');
    } finally {
      setIsSaving(false);
    }
  };

  const handleJoinPool = async () => {
    if (!activePool || !selectedChampionPick) return;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = await officePoolApi.join(activePool.id, {
        inviteCode: joinInviteCode.trim().toUpperCase() || activePool.inviteCode,
        championPickTeamId: selectedChampionPick,
      });
      openPool(response.pool.id, 'detail');
      setNotice(`Joined ${response.pool.name}`);
      refreshHomeInBackground();
    } catch (err: any) {
      console.error('Failed to join office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to join office pool');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetChampionPick = async () => {
    if (!activePool || !selectedChampionPick) return;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const savedSidePicks = await officePoolApi.saveSidePicks(activePool.id, [
        {
          type: 'CHAMPION',
          key: CHAMPION_SIDE_PICK_KEY,
          teamId: selectedChampionPick,
        },
      ]);
      const championSidePick = getChampionSidePick(savedSidePicks);
      const savedPickId = championSidePick?.teamId ?? selectedChampionPick;
      setSidePicks(savedSidePicks);
      setConfirmedChampionPickId(savedPickId);
      setSelectedChampionPick(savedPickId);
      const [nextMembers, nextLeaderboard] = await Promise.all([
        officePoolApi.getMembers(activePool.id).catch(() => null),
        officePoolApi.getLeaderboard(activePool.id),
      ]);
      if (nextMembers) {
        setMembers(nextMembers);
      }
      setLeaderboard(nextLeaderboard);
      setNotice('Champion pick saved');
    } catch (err: any) {
      console.error('Failed to save champion pick:', err);
      setError(err?.response?.data?.message ?? 'Failed to save champion pick');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickChange = (predictionId: string, option: OfficePoolPickOption) => {
    setPicks((prev) => ({
      ...prev,
      [predictionId]: option,
    }));
  };

  const handleSavePicks = async () => {
    if (!activePool) return;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      await officePoolApi.savePicks(activePool.id, picks);
      const nextLeaderboard = await officePoolApi.getLeaderboard(activePool.id);
      setLeaderboard(nextLeaderboard);
      setNotice('Picks saved');
    } catch (err: any) {
      console.error('Failed to save office pool picks:', err);
      setError(err?.response?.data?.message ?? 'Failed to save office pool picks');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Loading office pools...</div>
      </div>
    );
  }

  if (error && allPools.length === 0 && screen === 'home') {
    return (
      <div className="container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container office-pool-page">
      {screen === 'home' && (
        <>
          <div className="header">
            <h1>Office Pool</h1>
            <p>{scopeExternalId ? 'Run a pool for this Telegram group' : 'View the office pools you already joined'}</p>
          </div>

          {notice && <div className="office-pool-notice">{notice}</div>}
          {error && <div className="office-pool-error">{error}</div>}

          <section className="office-pool-panel office-pool-hero">
            <div>
              <div className="office-pool-eyebrow">DePick - Office Pools</div>
              <h2>{isScopedLaunch ? 'Play your pool with your friends' : 'Your joined office pools'}</h2>
              <p>{isScopedLaunch ? 'Choose the World Cup stage, open the pool for your group, then each player joins with a champion pick.' : 'Open a pool you already joined from Telegram group chat.'}</p>
            </div>
            {isScopedLaunch ? (
              <button className="predict-button office-pool-cta" onClick={() => setScreen('create')}>
                Create Pool
              </button>
            ) : null}
          </section>

          {isScopedLaunch ? (
            <section className="office-pool-panel">
              <h2>Join by Invite Code</h2>
              <div className="office-pool-inline-row">
                <input
                  value={joinInviteCode}
                  onChange={(e) => setJoinInviteCode(e.target.value.toUpperCase())}
                  placeholder="Invite code"
                />
                <button className="predict-button office-pool-inline-btn" onClick={handleInviteLookup} disabled={!joinInviteCode.trim()}>
                  Open
                </button>
              </div>
            </section>
          ) : null}

          <PoolListSection
            title="Your Pools"
            subtitle="Pools you already joined or created"
            pools={myPools}
            emptyMessage="You have not joined any office pools yet."
            onOpen={(pool) => openPool(pool.id)}
          />

          {isScopedLaunch ? (
            <PoolListSection
              title="This Group"
              subtitle="Pools in this Telegram group that you have not joined yet"
              pools={discoverPools}
              emptyMessage="No other office pools have been started in this Telegram group yet."
              onOpen={(pool) => openPool(pool.id)}
            />
          ) : null}
        </>
      )}

      {screen === 'create' && (
        <>
          <PageTopBar title="Create Pool" onBack={() => setScreen('home')} />
          {notice && <div className="office-pool-notice">{notice}</div>}
          {error && <div className="office-pool-error">{error}</div>}

          <section className="office-pool-panel">
            <h2>Pool Setup</h2>
            <div className="office-pool-form">
              <input
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  setCreateNameTouched(true);
                }}
                onBlur={() => setCreateNameTouched(true)}
                placeholder="Pool name"
              />
              {createNameError ? <p className="office-pool-field-error">{createNameError}</p> : null}
              <div className="office-pool-mode-grid">
                {WORLD_CUP_MODE_CONFIG.map((mode) => (
                  <button
                    key={mode.mode}
                    type="button"
                    className={`office-pool-mode-card ${createMode === mode.mode ? 'office-pool-mode-card-active' : ''}`}
                    onClick={() => setCreateMode(mode.mode)}
                  >
                    <div className="office-pool-mode-head">
                      <strong>{mode.title}</strong>
                      <span>{mode.badge}</span>
                    </div>
                    <p>{mode.description}</p>
                    <div className="office-pool-mode-meta">
                      <span>{formatDate(mode.startsAt)} - {formatDate(mode.endsAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <label>
                <span>Minimum entry fee (PICK)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={createEntryFee}
                  onChange={(e) => {
                    setCreateEntryFee(e.target.value);
                    setCreateEntryFeeTouched(true);
                  }}
                  onBlur={() => setCreateEntryFeeTouched(true)}
                  placeholder="10"
                />
              </label>
              {createEntryFeeError ? <p className="office-pool-field-error">{createEntryFeeError}</p> : null}
              <div className="office-pool-form-summary">
                <p className="office-pool-copy">
                  <strong>{createModeConfig.title}</strong>
                  {' · '}
                  {createWindowLabel}
                </p>
                <p className="office-pool-copy">{createModeConfig.championLabel}</p>
                <p className="office-pool-copy">Every player pays at least this many PICK to enter, so the prize pool grows as more friends join.</p>
                <p className="office-pool-copy">
                  Creating the pool is free for the group creator. You only pay when you join as a player.
                  {createWindowDays ? ` Pool window: ${createWindowDays} day${createWindowDays > 1 ? 's' : ''}.` : ''}
                </p>
              </div>
              <button className="predict-button" onClick={handleCreatePool} disabled={isSaving}>
                {isSaving ? 'Creating...' : 'Create Pool'}
              </button>
            </div>
          </section>
        </>
      )}

      {(screen === 'detail' || screen === 'picks') && (
        <>
          <PageTopBar
            title={screen === 'detail' ? activePool?.name ?? 'Office Pool' : 'Match Picks'}
            subtitle={screen === 'detail' ? activePool?.inviteCode : activePool?.name}
            onBack={() => setScreen(screen === 'detail' ? 'home' : 'detail')}
          />
          {notice && <div className="office-pool-notice">{notice}</div>}
          {error && <div className="office-pool-error">{error}</div>}

          {!activePool || activePool.id !== activePoolId ? (
            <div className="loading">Loading pool...</div>
          ) : (
            <>
              {screen === 'detail' && (
                <>
                  <section className="office-pool-panel">
                    <div className="office-pool-panel-head">
                      <div>
                        <div className="office-pool-eyebrow">{getModeLabel(activePool.mode)}</div>
                        <h2>{activePool.name}</h2>
                      </div>
                      {activePool.isMember && (
                        <button className="predict-button office-pool-inline-btn" onClick={() => setScreen('picks')}>
                          Open Picks
                        </button>
                      )}
                    </div>

                    <div className="office-pool-meta-grid">
                      <div><span>Invite</span><strong>{activePool.inviteCode}</strong></div>
                      <div><span>Joined</span><strong>{activePool.participants} players</strong></div>
                      <div><span>Minimum entry</span><strong>{activePool.entryFee} PICK</strong></div>
                      <div><span>Window</span><strong>{formatDateTime(activePool.startsAt)} - {formatDateTime(activePool.endsAt)}</strong></div>
                      <div><span>Format</span><strong>{getModeLabel(activePool.mode)}</strong></div>
                      <div><span>Scope</span><strong>{activePool.scopeExternalId ?? 'General'}</strong></div>
                    </div>
                  </section>

                  {!activePool.isMember ? (
                    <section className="office-pool-panel">
                      <h2>Join Pool</h2>
                      <p className="office-pool-copy">Set your champion pick before you enter the pool. We will keep calling it champion pick in the join flow, even while World Cup side-picks expand later.</p>
                      <ChampionPicker
                        teams={championTeams}
                        selectedTeamId={selectedChampionPick}
                        onSelect={setSelectedChampionPick}
                      />
                      <button className="predict-button" onClick={handleJoinPool} disabled={!selectedChampionPick || isSaving}>
                        {isSaving ? 'Joining...' : 'Join Pool'}
                      </button>
                      <p className="office-pool-copy">
                        Correct champion pick earns +{leaderboard?.championBonusPoints ?? 5} points after the pool fully settles.
                      </p>
                    </section>
                  ) : (
                    <>
                      <section className="office-pool-panel">
                        <h2>Your Entry</h2>
                        <div className="office-pool-entry-card">
                          <div>
                            <span className="office-pool-copy-label">Champion Pick</span>
                            <strong>
                              {myMember?.championPickTeamName
                                ?? (confirmedChampionPickId
                                  ? (championTeams.find((t) => t.id === confirmedChampionPickId)?.name ?? 'Saved')
                                  : 'Not chosen yet')}
                            </strong>
                          </div>
                          <div>
                            <span className="office-pool-copy-label">Invite</span>
                            <strong>{activePool.inviteCode}</strong>
                          </div>
                        </div>
                        {(confirmedChampionPickId || myMember?.championPickTeamId) ? (
                          <p className="office-pool-copy">
                            Your champion pick is locked in for this pool. Correct pick earns +{leaderboard?.championBonusPoints ?? 5} points when the winner is known.
                          </p>
                        ) : (
                          <>
                            <ChampionPicker
                              teams={championTeams}
                              selectedTeamId={selectedChampionPick}
                              onSelect={setSelectedChampionPick}
                            />
                            <button className="predict-button" onClick={handleSetChampionPick} disabled={!selectedChampionPick || isSaving}>
                              {isSaving ? 'Saving...' : 'Set Champion Pick'}
                            </button>
                            <p className="office-pool-copy">
                              Champion pick is stored with your pool entry. Correct pick earns +{leaderboard?.championBonusPoints ?? 5} points when the winner is known.
                            </p>
                          </>
                        )}
                      </section>

                      <section className="office-pool-panel">
                        <div className="office-pool-panel-head">
                          <h2>Prize Pool</h2>
                          <span className="office-pool-progress">{leaderboard?.totalPrizePool ?? 0} PICK</span>
                        </div>
                        <div className="office-pool-entry-card">
                          <div>
                            <span className="office-pool-copy-label">Reward Token</span>
                            <strong>PICK</strong>
                          </div>
                          <div>
                            <span className="office-pool-copy-label">Total Prize</span>
                            <strong>{leaderboard?.totalPrizePool ?? 0} PICK</strong>
                          </div>
                        </div>
                        <p className="office-pool-copy">
                          Winner takes the pot. If first place is tied, the {leaderboard?.totalPrizePool ?? 0} PICK reward is shared evenly across tied winners.
                        </p>
                        {leaderboard?.championWinnerTeamName ? (
                          <p className="office-pool-copy">
                            Champion winner: {leaderboard.championWinnerTeamName} · +{leaderboard.championBonusPoints} bonus points applied.
                          </p>
                        ) : (
                          <p className="office-pool-copy">
                            Champion bonus is applied after the full pool window settles and a final winner can be inferred.
                          </p>
                        )}
                      </section>

                      <section className="office-pool-panel">
                        <div className="office-pool-panel-head">
                          <h2>Leaderboard</h2>
                          <span className="office-pool-progress">
                            {leaderboard?.completedMatches ?? 0}/{leaderboard?.totalMatches ?? 0} matches settled
                          </span>
                        </div>
                        <div className="office-pool-leaderboard">
                          {leaderboard?.leaderboard.map((entry) => {
                            const isMe = entry.userId === currentUserId;
                            const isSharedRank = (sharedRanks.get(entry.rank) ?? 0) > 1;
                            return (
                              <div key={entry.userId} className={`office-pool-leaderboard-row ${isMe ? 'office-pool-leaderboard-me' : ''}`}>
                                <div className="office-pool-leaderboard-main">
                                  <span className="office-pool-rank">#{entry.rank}</span>
                                  <div>
                                    <strong>{entry.displayNameSnapshot}</strong>
                                    <div className="office-pool-copy-line">
                                      {entry.championPickTeamName ?? 'No champion pick'}
                                      {entry.championPickCorrect ? ` · +${entry.championBonusPoints} champion bonus` : ''}
                                      {isSharedRank ? ' · Shared place' : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="office-pool-leaderboard-side">
                                  <span>{entry.points} pts</span>
                                  {entry.prizeAmount != null ? <span className="office-pool-prize-tag">{entry.prizeAmount} PICK</span> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="office-pool-panel">
                        <div className="office-pool-panel-head">
                          <h2>Members</h2>
                          <span className="office-pool-progress">{members.length} joined</span>
                        </div>
                        <div className="office-pool-member-list">
                          {members.map((member) => (
                            <div key={member.userId} className="office-pool-member-row">
                              <strong>{member.displayNameSnapshot}</strong>
                              <span>{member.championPickTeamName ?? 'Champion not set'}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}

              {screen === 'picks' && (
                <section className="office-pool-panel">
                  <div className="office-pool-panel-head">
                    <div>
                      <h2>Picks</h2>
                      <p className="office-pool-copy">Choose Home, Draw, or Away for each match.</p>
                    </div>
                    <button className="predict-button office-pool-inline-btn" onClick={handleSavePicks} disabled={isSaving || !activePool.isMember}>
                      {isSaving ? 'Saving...' : 'Save Picks'}
                    </button>
                  </div>
                  {!activePool.isMember ? (
                    <div className="empty"><p>Join this pool first.</p></div>
                  ) : predictions.length === 0 ? (
                    <div className="empty"><p>No matches available for this pool window.</p></div>
                  ) : (
                    <div className="office-pool-match-list">
                      {predictions.map((match) => {
                        const resultPick = pickFromResult(match.result);
                        const myPick = picks[match.id];
                        return (
                          <div key={match.id} className={`office-pool-match-card ${match.isLocked ? 'office-pool-match-locked' : ''}`}>
                            <div className="office-pool-match-head">
                              <span>{formatDateTime(match.datetime)}</span>
                              <span>{match.isLocked ? 'Locked' : 'Open'}</span>
                            </div>
                            <div className="office-pool-versus">
                              <div className="office-pool-team">
                                <img src={match.homeTeamLogo} alt={match.homeTeamName} />
                                <strong>{match.homeTeamName}</strong>
                              </div>
                              <span>VS</span>
                              <div className="office-pool-team">
                                <img src={match.awayTeamLogo} alt={match.awayTeamName} />
                                <strong>{match.awayTeamName}</strong>
                              </div>
                            </div>
                            <div className="office-pool-pick-row">
                              {(['HOME', 'DRAW', 'AWAY'] as OfficePoolPickOption[]).map((option) => (
                                <button
                                  key={option}
                                  className={`office-pool-pick-btn ${myPick === option ? 'office-pool-pick-selected' : ''} ${resultPick === option && match.isLocked ? 'office-pool-pick-result' : ''}`}
                                  onClick={() => handlePickChange(match.id, option)}
                                  disabled={match.isLocked}
                                >
                                  {getPickLabel(option)}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PageTopBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="office-pool-topbar">
      <button className="office-pool-back" onClick={onBack}>Back</button>
      <div className="office-pool-topbar-copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function PoolListSection({
  title,
  subtitle,
  pools,
  emptyMessage,
  onOpen,
}: {
  title: string;
  subtitle: string;
  pools: OfficePoolSummary[];
  emptyMessage: string;
  onOpen: (pool: OfficePoolSummary) => void;
}) {
  return (
    <section className="office-pool-panel">
      <div className="office-pool-panel-head">
        <div>
          <h2>{title}</h2>
          <p className="office-pool-copy">{subtitle}</p>
        </div>
      </div>
      {pools.length === 0 ? (
        <div className="empty"><p>{emptyMessage}</p></div>
      ) : (
        <div className="office-pool-list">
          {pools.map((pool) => (
            <button key={pool.id} className="office-pool-card" onClick={() => onOpen(pool)}>
              <div className="office-pool-card-top">
                <strong>{pool.name}</strong>
                <span>{pool.status}</span>
              </div>
              <div className="office-pool-card-meta">
                <span>{getModeLabel(pool.mode)}</span>
                <span>{pool.participants} players joined</span>
              </div>
              <div className="office-pool-card-meta">
                <span>{pool.entryFee} PICK min</span>
                <span>{pool.isCreator ? 'Creator' : pool.isMember ? 'Joined' : 'Open'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ChampionPicker({
  teams,
  selectedTeamId,
  onSelect,
}: {
  teams: TeamOption[];
  selectedTeamId: string;
  onSelect: (teamId: string) => void;
}) {
  if (teams.length === 0) {
    return <div className="empty"><p>No eligible teams found for this pool yet.</p></div>;
  }

  return (
    <div className="office-pool-champion-grid">
      {teams.map((team) => (
        <button
          key={team.id}
          className={`office-pool-champion-card ${selectedTeamId === team.id ? 'office-pool-champion-card-active' : ''}`}
          onClick={() => onSelect(team.id)}
        >
          <img src={team.logo} alt={team.name} />
          <strong>{team.name}</strong>
        </button>
      ))}
    </div>
  );
}
