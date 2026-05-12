import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { officePoolApi, telegramAuthApi } from '../services/api';
import { tokenUtils } from '../utils/token';
import {
  CreateOfficePoolRequest,
  OfficePoolLeaderboardResponse,
  OfficePoolMemberSummary,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
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

interface DateParts {
  year: string;
  month: string;
  day: string;
}

type Screen = 'home' | 'create' | 'detail' | 'picks';

function toDateInput(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function startOfDayIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toISOString();
}

function endOfDayIso(value: string) {
  const date = new Date(`${value}T23:59:59`);
  return date.toISOString();
}

function parseDateParts(value: string): DateParts {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month, day };
}

function buildDateFromParts(parts: DateParts): string {
  const fallback = toDateInput(new Date());
  if (!parts.year || !parts.month || !parts.day) {
    return fallback;
  }

  const maxDay = getDaysInMonth(Number(parts.year), Number(parts.month));
  const safeDay = Math.min(Number(parts.day), maxDay);
  const date = new Date(Number(parts.year), Number(parts.month) - 1, safeDay);
  return toDateInput(date);
}

function getDaysInMonth(year: number, month: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 31;
  }

  return new Date(year, month, 0).getDate();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
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
  const [isLoading, setIsLoading] = useState(true);
  const [poolLoading, setPoolLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [allPools, setAllPools] = useState<OfficePoolSummary[]>([]);
  const [myPools, setMyPools] = useState<OfficePoolSummary[]>([]);
  const [activePoolId, setActivePoolId] = useState('');
  const [activePool, setActivePool] = useState<OfficePoolSummary | null>(null);
  const [members, setMembers] = useState<OfficePoolMemberSummary[]>([]);
  const [predictions, setPredictions] = useState<OfficePoolPredictionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<OfficePoolLeaderboardResponse | null>(null);
  const [picks, setPicks] = useState<Record<string, OfficePoolPickOption>>({});
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [selectedChampionPick, setSelectedChampionPick] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(tokenUtils.getToken());

  const [createName, setCreateName] = useState('');
  const [createTournament, setCreateTournament] = useState('WORLD_CUP');
  const [createSeasonKey, setCreateSeasonKey] = useState('');
  const [createStart, setCreateStart] = useState(toDateInput(new Date()));
  const [createEnd, setCreateEnd] = useState(toDateInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
  const [createEntryFee, setCreateEntryFee] = useState('10');

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

  const createStartParts = useMemo(() => parseDateParts(createStart), [createStart]);
  const createEndParts = useMemo(() => parseDateParts(createEnd), [createEnd]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => String(currentYear - 1 + index));
  }, []);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')),
    [],
  );
  const startDayOptions = useMemo(
    () =>
      Array.from(
        { length: getDaysInMonth(Number(createStartParts.year), Number(createStartParts.month)) },
        (_, index) => String(index + 1).padStart(2, '0'),
      ),
    [createStartParts.month, createStartParts.year],
  );
  const endDayOptions = useMemo(
    () =>
      Array.from(
        { length: getDaysInMonth(Number(createEndParts.year), Number(createEndParts.month)) },
        (_, index) => String(index + 1).padStart(2, '0'),
      ),
    [createEndParts.month, createEndParts.year],
  );

  useEffect(() => {
    const telegramWebApp = (globalThis as any).Telegram?.WebApp;
    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();
  }, []);

  useEffect(() => {
    const bootstrapOfficePool = async () => {
      try {
        setIsLoading(true);
        setError(null);

        let nextToken = sessionToken;

        if (authToken) {
          tokenUtils.setToken(authToken, 'TELEGRAM');
          nextToken = authToken;
          setSessionToken(authToken);
        } else if (telegramAuthQueryData) {
          const authResponse = await telegramAuthApi.verify(telegramAuthQueryData);
          tokenUtils.setToken(authResponse.auth_token, 'TELEGRAM');
          nextToken = authResponse.auth_token;
          setSessionToken(authResponse.auth_token);
        } else if (telegramWebAppState.initData) {
          const authResponse = await telegramAuthApi.verifyMiniApp({ initData: telegramWebAppState.initData });
          tokenUtils.setToken(authResponse.auth_token, 'TELEGRAM');
          nextToken = authResponse.auth_token;
          setSessionToken(authResponse.auth_token);
        } else if (!tokenUtils.isTokenValid()) {
          throw new Error('Missing authentication token');
        } else {
          nextToken = tokenUtils.getToken();
          setSessionToken(nextToken);
        }

        if (!nextToken) {
          throw new Error('Missing authentication token');
        }

        const [mine, all] = await Promise.all([
          officePoolApi.listMine(),
          isScopedLaunch
            ? officePoolApi.list({ scopeProvider, scopeExternalId })
            : Promise.resolve([]),
        ]);

        setMyPools(mine);
        setAllPools(all);

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
        console.error('Failed to load office pools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load office pools');
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrapOfficePool();
  }, [
    authToken,
    isScopedLaunch,
    navigate,
    scopeExternalId,
    scopeProvider,
    sessionToken,
    telegramAuthQueryData,
    telegramWebAppState.initData,
  ]);

  useEffect(() => {
    if (!activePoolId || (screen !== 'detail' && screen !== 'picks')) return;

    const loadPoolContext = async () => {
      try {
        setPoolLoading(true);
        setError(null);
        setActivePool(null);
        const pool = await officePoolApi.getById(activePoolId);

        setActivePool(pool);

        if (pool.isMember) {
          const [nextPredictions, nextMembers, nextLeaderboard, nextPicks] = await Promise.all([
            officePoolApi.getPredictions(activePoolId),
            officePoolApi.getMembers(activePoolId),
            officePoolApi.getLeaderboard(activePoolId),
            officePoolApi.getPicks(activePoolId).catch(() => ({})),
          ]);
          setPredictions(nextPredictions);
          setMembers(nextMembers);
          setLeaderboard(nextLeaderboard);
          setPicks(nextPicks);
        } else {
          const nextPredictions = await officePoolApi.getPredictions(activePoolId).catch(() => []);
          setPredictions(nextPredictions);
          setMembers([]);
          setLeaderboard(null);
          setPicks({});
        }
      } catch (err) {
        console.error('Failed to load office pool details:', err);
        setError('Failed to load office pool details');
      } finally {
        setPoolLoading(false);
      }
    };

    void loadPoolContext();
  }, [activePoolId, screen]);

  useEffect(() => {
    if (!myMember?.championPickTeamId) return;
    setSelectedChampionPick(myMember.championPickTeamId);
  }, [myMember?.championPickTeamId]);

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

  const openPool = (poolId: string, nextScreen: Screen = 'detail') => {
    setActivePool(null);
    setActivePoolId(poolId);
    setSelectedChampionPick('');
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
      const entryFee = Number(createEntryFee);
      if (!Number.isFinite(entryFee) || entryFee <= 0) {
        throw new Error('Minimum PICK entry fee must be greater than 0');
      }
      const payload: CreateOfficePoolRequest = {
        name: createName.trim(),
        tournament: createTournament,
        seasonKey: createSeasonKey.trim() || undefined,
        startsAt: startOfDayIso(createStart),
        endsAt: endOfDayIso(createEnd),
        scopeProvider,
        scopeExternalId,
        entryFee,
      };

      const pool = await officePoolApi.create(payload);
      await refreshHome();
      setCreateName('');
      setCreateSeasonKey('');
      setCreateEntryFee('10');
      openPool(pool.id, 'detail');
      setNotice(`Created ${pool.name}. Set your champion pick next.`);
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
      await officePoolApi.join(activePool.id, {
        inviteCode: joinInviteCode.trim().toUpperCase() || activePool.inviteCode,
        championPickTeamId: selectedChampionPick,
      });
      await refreshHome();
      openPool(activePool.id, 'detail');
      setNotice(`Joined ${activePool.name}`);
    } catch (err: any) {
      console.error('Failed to join office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to join office pool');
    } finally {
      setIsSaving(false);
    }
  };

  const applyCreateDatePreset = (days: number) => {
    const start = new Date();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    setCreateStart(toDateInput(start));
    setCreateEnd(toDateInput(end));
  };

  const updateCreateDate = (target: 'start' | 'end', nextParts: Partial<DateParts>) => {
    const currentParts = target === 'start' ? createStartParts : createEndParts;
    const merged = {
      ...currentParts,
      ...nextParts,
    };
    const nextValue = buildDateFromParts(merged);

    if (target === 'start') {
      setCreateStart(nextValue);
      return;
    }

    setCreateEnd(nextValue);
  };

  const handleSetChampionPick = async () => {
    if (!activePool || !selectedChampionPick) return;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      await officePoolApi.setChampionPick(activePool.id, selectedChampionPick);
      const [nextMembers, nextLeaderboard] = await Promise.all([
        officePoolApi.getMembers(activePool.id),
        officePoolApi.getLeaderboard(activePool.id),
      ]);
      setMembers(nextMembers);
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
              <p>{isScopedLaunch ? 'Create a pool, pick a champion, then submit your match picks.' : 'Open a pool you already joined from Telegram group chat.'}</p>
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
              subtitle="Pools already attached to this Telegram group"
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
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Pool name" />
              <select value={createTournament} onChange={(e) => setCreateTournament(e.target.value)}>
                <option value="WORLD_CUP">World Cup</option>
                <option value="PREMIER_LEAGUE">Premier League</option>
                <option value="LA_LIGA">La Liga</option>
                <option value="INTERNATIONAL_FRIENDLIES">International Friendlies</option>
              </select>
              <input value={createSeasonKey} onChange={(e) => setCreateSeasonKey(e.target.value)} placeholder="Season key (optional)" />
              <div className="office-pool-date-preset-row">
                <button type="button" className="office-pool-date-chip" onClick={() => applyCreateDatePreset(7)}>7 days</button>
                <button type="button" className="office-pool-date-chip" onClick={() => applyCreateDatePreset(14)}>2 weeks</button>
                <button type="button" className="office-pool-date-chip" onClick={() => applyCreateDatePreset(30)}>1 month</button>
              </div>
              <label>
                <span>Start date</span>
                <div className="office-pool-date-select-row">
                  <select value={createStartParts.month} onChange={(e) => updateCreateDate('start', { month: e.target.value })}>
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                  <select value={createStartParts.day} onChange={(e) => updateCreateDate('start', { day: e.target.value })}>
                    {startDayOptions.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <select value={createStartParts.year} onChange={(e) => updateCreateDate('start', { year: e.target.value })}>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                <span>End date</span>
                <div className="office-pool-date-select-row">
                  <select value={createEndParts.month} onChange={(e) => updateCreateDate('end', { month: e.target.value })}>
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                  <select value={createEndParts.day} onChange={(e) => updateCreateDate('end', { day: e.target.value })}>
                    {endDayOptions.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <select value={createEndParts.year} onChange={(e) => updateCreateDate('end', { year: e.target.value })}>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                <span>Minimum entry fee (PICK)</span>
                <input type="number" min="1" step="1" value={createEntryFee} onChange={(e) => setCreateEntryFee(e.target.value)} placeholder="10" />
              </label>
              <p className="office-pool-copy">Every player pays at least this many PICK to enter, so the prize pool grows as more friends join.</p>
              <button className="predict-button" onClick={handleCreatePool} disabled={!createName.trim() || isSaving}>
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

          {poolLoading || !activePool ? (
            <div className="loading">Loading pool...</div>
          ) : (
            <>
              {screen === 'detail' && (
                <>
                  <section className="office-pool-panel">
                    <div className="office-pool-panel-head">
                      <div>
                        <div className="office-pool-eyebrow">{activePool.tournament}</div>
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
                      <div><span>Scope</span><strong>{activePool.scopeExternalId ?? 'General'}</strong></div>
                    </div>
                  </section>

                  {!activePool.isMember ? (
                    <section className="office-pool-panel">
                      <h2>Join Pool</h2>
                      <p className="office-pool-copy">Pick your tournament champion before you enter the pool.</p>
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
                            <strong>{myMember?.championPickTeamName ?? 'Not chosen yet'}</strong>
                          </div>
                          <div>
                            <span className="office-pool-copy-label">Invite</span>
                            <strong>{activePool.inviteCode}</strong>
                          </div>
                        </div>
                        {myMember?.championPickTeamId ? (
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
                <span>{pool.tournament}</span>
                <span>{pool.participants} players joined</span>
              </div>
              <div className="office-pool-card-meta">
                <span>{pool.entryFee} PICK min</span>
                <span>{pool.isMember ? 'Joined' : 'Open'}</span>
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
