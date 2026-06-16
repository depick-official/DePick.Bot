import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { officePoolApi } from '../services/api';
import { tokenUtils } from '../utils/token';
import {
  CreateOfficePoolRequest,
  OfficePoolJoinResponse,
  OfficePoolLeaderboardResponse,
  OfficePoolMemberSummary,
  OfficePoolMode,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
  SetOfficePoolSidePickItem,
} from '../types/OfficePool';

interface DecodedToken {
  sub?: string;
}

interface TelegramWebAppState {
  startParam?: string;
}

interface HookModeConfig {
  startsAt: string;
  endsAt: string;
  isLocked?: boolean;
  lockedMessage?: string;
}

export const PODIUM_KEYS = ['FIRST', 'SECOND', 'THIRD'] as const;
export type PodiumKey = typeof PODIUM_KEYS[number];
type Screen = 'home' | 'create' | 'detail' | 'picks';

function startOfDayIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endOfDayIso(value: string) {
  return `${value}T23:59:59.999Z`;
}

function getDefaultCreateMode(
  worldCupModeConfigMap: Record<OfficePoolMode, HookModeConfig>,
) {
  const now = new Date();
  const eligibleModes = (Object.keys(worldCupModeConfigMap) as OfficePoolMode[])
    .filter((mode) => {
      const config = worldCupModeConfigMap[mode];
      return new Date(endOfDayIso(config.endsAt)) >= now;
    })
    .sort(
      (left, right) =>
        new Date(startOfDayIso(worldCupModeConfigMap[left].startsAt)).getTime() -
        new Date(startOfDayIso(worldCupModeConfigMap[right].startsAt)).getTime(),
    );

  return eligibleModes[0] ?? 'GROUP_STAGE';
}

function buildOfficePoolSearch(
  scopeProvider?: string,
  scopeExternalId?: string,
  poolId?: string,
) {
  const nextParams = new URLSearchParams();
  if (scopeProvider) {
    nextParams.set('scope_provider', scopeProvider);
  }
  if (scopeExternalId) {
    nextParams.set('scope_external_id', scopeExternalId);
  }
  if (poolId) {
    nextParams.set('pool_id', poolId);
  }
  const nextQuery = nextParams.toString();
  return nextQuery ? `?${nextQuery}` : '';
}

function getTelegramWebAppState(searchParams: URLSearchParams): TelegramWebAppState {
  const telegramWebApp = (globalThis as any).Telegram?.WebApp;
  const startParamFromInit =
    typeof telegramWebApp?.initDataUnsafe?.start_param === 'string' &&
    telegramWebApp.initDataUnsafe.start_param.length > 0
      ? telegramWebApp.initDataUnsafe.start_param
      : undefined;
  const startParamFromQuery = searchParams.get('tgWebAppStartParam') ?? undefined;

  return {
    startParam: startParamFromInit ?? startParamFromQuery,
  };
}

function parseOfficePoolScopeFromStartParam(startParam?: string) {
  if (!startParam || !startParam.startsWith('officepool_')) {
    return { scopeProvider: undefined, scopeExternalId: undefined, poolId: undefined };
  }

  const payload = startParam.slice('officepool_'.length);
  const separatorIndex = payload.indexOf('_');
  if (separatorIndex === -1) {
    if (!payload) {
      return { scopeProvider: undefined, scopeExternalId: undefined, poolId: undefined };
    }

    return {
      scopeProvider: 'TELEGRAM',
      scopeExternalId: payload,
      poolId: undefined,
    };
  }

  const scopeExternalId = payload.slice(0, separatorIndex);
  const poolId = payload.slice(separatorIndex + 1);
  if (!scopeExternalId) {
    return { scopeProvider: undefined, scopeExternalId: undefined, poolId: undefined };
  }

  return {
    scopeProvider: 'TELEGRAM',
    scopeExternalId,
    poolId: poolId || undefined,
  };
}

async function fetchHomePools(scope: {
  isScopedLaunch: boolean;
  scopeProvider?: string;
  scopeExternalId?: string;
}) {
  const [mine, all, scopeAccess] = await Promise.all([
    officePoolApi.listMine(),
    scope.isScopedLaunch
      ? officePoolApi.list({
          scopeProvider: scope.scopeProvider,
          scopeExternalId: scope.scopeExternalId,
        })
      : Promise.resolve([]),
    scope.isScopedLaunch
      ? officePoolApi.getScopeAccess({
          scopeProvider: scope.scopeProvider,
          scopeExternalId: scope.scopeExternalId,
        })
      : Promise.resolve({ canCreate: false }),
  ]);

  return { mine, all, canCreateScopedPool: scopeAccess.canCreate };
}

async function fetchPoolContext(poolId: string) {
  const pool = await officePoolApi.getById(poolId);

  if (pool.isMember) {
    const [predictions, members, leaderboard, picks, sidePicks] = await Promise.all([
      officePoolApi.getPredictions(poolId),
      officePoolApi.getMembers(poolId),
      officePoolApi.getLeaderboard(poolId),
      officePoolApi.getPicks(poolId).catch(() => ({})),
      officePoolApi.getSidePicks(poolId).catch(() => []),
    ]);

    return {
      pool,
      predictions,
      members,
      leaderboard,
      picks,
      sidePicks,
    };
  }

  const [predictions, leaderboard] = await Promise.all([
    officePoolApi.getPredictions(poolId).catch(() => []),
    pool.isCreator
      ? officePoolApi.getLeaderboard(poolId).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    pool,
    predictions,
    members: [] as OfficePoolMemberSummary[],
    leaderboard,
    picks: {} as Record<string, OfficePoolPickOption>,
    sidePicks: [] as OfficePoolSidePickSummary[],
  };
}

export function useOfficePoolPageData(worldCupModeConfigMap: Record<OfficePoolMode, HookModeConfig>) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [allPools, setAllPools] = useState<OfficePoolSummary[]>([]);
  const [myPools, setMyPools] = useState<OfficePoolSummary[]>([]);
  const [activePoolId, setActivePoolId] = useState('');
  const [activePool, setActivePool] = useState<OfficePoolSummary | null>(null);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [poolReloadToken, setPoolReloadToken] = useState(0);
  const [members, setMembers] = useState<OfficePoolMemberSummary[]>([]);
  const [predictions, setPredictions] = useState<OfficePoolPredictionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<OfficePoolLeaderboardResponse | null>(null);
  const [picks, setPicks] = useState<Record<string, OfficePoolPickOption>>({});
  const [sidePicks, setSidePicks] = useState<OfficePoolSidePickSummary[]>([]);
  const [joinSidePickMap, setJoinSidePickMap] = useState<Record<string, string>>({});
  const [activeQualifierGroupIndex, setActiveQualifierGroupIndex] = useState(0);
  const [activePodiumKey, setActivePodiumKey] = useState<PodiumKey>('FIRST');
  const [canCreateScopedPool, setCanCreateScopedPool] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    tokenUtils.isTokenValid() ? tokenUtils.getToken() : null,
  );

  const [createName, setCreateName] = useState('');
  const [createMode, setCreateMode] = useState<OfficePoolMode>(() =>
    getDefaultCreateMode(worldCupModeConfigMap),
  );
  const [createEntryFee, setCreateEntryFee] = useState('10');
  const [createSubmitAttempted, setCreateSubmitAttempted] = useState(false);
  const [createNameTouched, setCreateNameTouched] = useState(false);
  const [createEntryFeeTouched, setCreateEntryFeeTouched] = useState(false);

  const telegramWebAppState = useMemo(
    () => getTelegramWebAppState(searchParams),
    [searchParams],
  );
  const startParamScope = useMemo(
    () => parseOfficePoolScopeFromStartParam(telegramWebAppState.startParam),
    [telegramWebAppState.startParam],
  );
  const scopeProvider = searchParams.get('scope_provider') ?? startParamScope.scopeProvider;
  const scopeExternalId =
    searchParams.get('scope_external_id') ?? startParamScope.scopeExternalId;
  const deepLinkedPoolId = searchParams.get('pool_id') ?? startParamScope.poolId;
  const isScopedLaunch = !!scopeProvider && !!scopeExternalId;
  const canonicalSearch = useMemo(
    () => buildOfficePoolSearch(scopeProvider, scopeExternalId, deepLinkedPoolId ?? undefined),
    [deepLinkedPoolId, scopeExternalId, scopeProvider],
  );
  const currentSearch = searchParams.toString();
  const currentSearchWithPrefix = currentSearch ? `?${currentSearch}` : '';

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

  const isJoinTemporarilyLocked =
    activePool?.mode === 'KNOCKOUT_STAGE' &&
    new Date() <
      new Date(
        startOfDayIso(worldCupModeConfigMap.KNOCKOUT_STAGE.startsAt),
      );

  useEffect(() => {
    let cancelled = false;

    const resolveOfficePoolSession = async () => {
      try {
        setError(null);

        const nextToken =
          tokenUtils.isTokenValid() ? tokenUtils.getToken() : null;

        if (!nextToken && isScopedLaunch) {
          tokenUtils.removeToken();
          throw new Error(
            'Missing Telegram Mini App session. Re-open Office Pool from Telegram.',
          );
        }

        if (!nextToken) {
          throw new Error('Missing authentication token');
        }

        if (cancelled) return;

        setSessionToken((current) => (current === nextToken ? current : nextToken));

        if (currentSearchWithPrefix !== canonicalSearch) {
          navigate(
            {
              pathname: '/office-pool',
              search: canonicalSearch,
            },
            { replace: true },
          );
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load office pools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load office pools');
        setSessionToken(null);
        setIsLoading(false);
      }
    };

    void resolveOfficePoolSession();

    return () => {
      cancelled = true;
    };
  }, [
    canonicalSearch,
    currentSearchWithPrefix,
    isScopedLaunch,
    navigate,
  ]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let cancelled = false;

    const refreshOfficePoolHome = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { mine, all, canCreateScopedPool: nextCanCreateScopedPool } = await fetchHomePools({
          isScopedLaunch,
          scopeProvider,
          scopeExternalId,
        });

        if (cancelled) return;

        setMyPools(mine);
        setAllPools(all);
        setCanCreateScopedPool(nextCanCreateScopedPool);
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
  }, [isScopedLaunch, scopeExternalId, scopeProvider, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !deepLinkedPoolId || activePoolId === deepLinkedPoolId) {
      return;
    }

    openPool(deepLinkedPoolId, 'detail');
  }, [activePoolId, deepLinkedPoolId, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !activePoolId) return;

    const loadPoolContext = async () => {
      try {
        setIsPoolLoading(true);
        setError(null);
        const nextContext = await fetchPoolContext(activePoolId);

        setActivePool(nextContext.pool);
        setPredictions(nextContext.predictions);
        setMembers(nextContext.members);
        setLeaderboard(nextContext.leaderboard);
        setPicks(nextContext.picks);
        setSidePicks(nextContext.sidePicks);
      } catch (err) {
        console.error('Failed to load office pool details:', err);
        setError('Failed to load office pool details');
      } finally {
        setIsPoolLoading(false);
      }
    };

    void loadPoolContext();
  }, [activePoolId, poolReloadToken, sessionToken]);

  useEffect(() => {
    if (screen !== 'create') {
      return;
    }

    if (!isScopedLaunch || !canCreateScopedPool) {
      setScreen('home');
    }
  }, [canCreateScopedPool, isScopedLaunch, screen]);

  const resetActivePoolContext = () => {
    setActivePool(null);
    setMembers([]);
    setPredictions([]);
    setLeaderboard(null);
    setPicks({});
    setSidePicks([]);
  };

  const goHome = () => {
    navigate(
      {
        pathname: '/office-pool',
        search: buildOfficePoolSearch(scopeProvider, scopeExternalId),
      },
      { replace: true },
    );
    setScreen('home');
    setError(null);
    setIsPoolLoading(false);
  };

  const refreshHome = async () => {
    const { mine, all, canCreateScopedPool: nextCanCreateScopedPool } = await fetchHomePools({
      isScopedLaunch,
      scopeProvider,
      scopeExternalId,
    });
    setMyPools(mine);
    setAllPools(all);
    setCanCreateScopedPool(nextCanCreateScopedPool);
  };

  const refreshHomeInBackground = () => {
    void refreshHome().catch((err) => {
      console.error('Failed to refresh office pool home state:', err);
    });
  };

  const openPool = (poolId: string, nextScreen: Screen = 'detail') => {
    navigate(
      {
        pathname: '/office-pool',
        search: buildOfficePoolSearch(scopeProvider, scopeExternalId, poolId),
      },
      { replace: true },
    );
    setActivePoolId(poolId);
    resetActivePoolContext();
    setIsPoolLoading(true);
    setPoolReloadToken((current) => current + 1);
    setJoinSidePickMap({});
    setActiveQualifierGroupIndex(0);
    setActivePodiumKey('FIRST');
    setScreen(nextScreen);
    setError(null);
  };

  const handleCreatePool = async () => {
    try {
      setError(null);
      setNotice(null);
      setIsSaving(true);
      setCreateSubmitAttempted(true);
      if (isScopedLaunch && !canCreateScopedPool) {
        throw new Error('Only Telegram group admins can create an Office Pool for this group');
      }
      const trimmedName = createName.trim();
      const entryFee = Number(createEntryFee);
      const createModeConfig = worldCupModeConfigMap[createMode];
      if (!trimmedName) {
        throw new Error('Pool name is required');
      }
      if (!Number.isFinite(entryFee) || entryFee <= 0) {
        throw new Error('Minimum entry fee must be greater than 0 PICK');
      }
      if (createModeConfig.isLocked) {
        throw new Error(
          createModeConfig.lockedMessage ?? 'This pool mode is not available yet',
        );
      }
      if (
        new Date(startOfDayIso(createModeConfig.startsAt)) >=
        new Date(endOfDayIso(createModeConfig.endsAt))
      ) {
        throw new Error('End date must be after the start date');
      }
      const payload: CreateOfficePoolRequest = {
        name: trimmedName,
        mode: createMode,
        tournament: 'WORLD_CUP',
        seasonKey: '2026',
        startsAt: startOfDayIso(createModeConfig.startsAt),
        endsAt: endOfDayIso(createModeConfig.endsAt),
        scopeProvider,
        scopeExternalId,
        entryFee,
      };

      const pool = await officePoolApi.create(payload);
      setCreateName('');
      setCreateMode(getDefaultCreateMode(worldCupModeConfigMap));
      setCreateEntryFee('10');
      setCreateSubmitAttempted(false);
      setCreateNameTouched(false);
      setCreateEntryFeeTouched(false);
      openPool(pool.id, 'detail');
      setNotice(`Created ${pool.name}. Players can now join with their locked Champion Picks.`);
      refreshHomeInBackground();
    } catch (err: any) {
      console.error('Failed to create office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to create office pool');
    } finally {
      setIsSaving(false);
    }
  };

  const handleJoinPool = async (
    sidePicks: SetOfficePoolSidePickItem[],
  ): Promise<OfficePoolJoinResponse | null> => {
    if (!activePool) return null;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = await officePoolApi.join(activePool.id, {
        sidePicks,
      });
      openPool(response.pool.id, 'detail');
      setNotice(`Joined ${response.pool.name}`);
      refreshHomeInBackground();
      return response;
    } catch (err: any) {
      console.error('Failed to join office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to join office pool');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareGroupLink = () => {
    if (!activePool?.telegramGroupInviteUrl) {
      setError('Telegram group share link is unavailable for this pool');
      return;
    }

    const groupName = activePool.telegramGroupName?.trim() || 'this Telegram group';
    const shareText = `Join "${activePool.name}" on DePick Office Pool in ${groupName}. After joining the Telegram group, open /officepool.`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(activePool.telegramGroupInviteUrl)}&text=${encodeURIComponent(shareText)}`;
    const telegramWebApp = (globalThis as any).Telegram?.WebApp;
    if (typeof telegramWebApp?.openTelegramLink === 'function') {
      telegramWebApp.openTelegramLink(shareUrl);
      return;
    }

    globalThis.open(shareUrl, '_blank', 'noopener,noreferrer');
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

  const handleSettlePool = async () => {
    if (!activePool) return;
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const nextLeaderboard = await officePoolApi.settle(activePool.id);
      setLeaderboard(nextLeaderboard);
      setNotice('Settlement triggered');
    } catch (err: any) {
      console.error('Failed to settle office pool:', err);
      setError(err?.response?.data?.message ?? 'Failed to settle office pool');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    screen,
    setScreen,
    isLoading,
    isSaving,
    error,
    notice,
    allPools,
    myPools,
    activePoolId,
    activePool,
    isPoolLoading,
    members,
    predictions,
    leaderboard,
    picks,
    setPicks,
    sidePicks,
    joinSidePickMap,
    setJoinSidePickMap,
    activeQualifierGroupIndex,
    setActiveQualifierGroupIndex,
    activePodiumKey,
    setActivePodiumKey,
    createName,
    setCreateName,
    createMode,
    setCreateMode,
    createEntryFee,
    setCreateEntryFee,
    createSubmitAttempted,
    createNameTouched,
    setCreateNameTouched,
    createEntryFeeTouched,
    setCreateEntryFeeTouched,
    currentUserId,
    discoverPools,
    scopeExternalId,
    isScopedLaunch,
    canCreateScopedPool,
    isJoinTemporarilyLocked,
    goHome,
    openPool,
    handleCreatePool,
    handleJoinPool,
    handleSavePicks,
    handleSettlePool,
    handleShareGroupLink,
  };
}
