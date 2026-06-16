import { useEffect, useMemo, useState } from 'react';
import {
  OfficePoolMode,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
  OfficePoolSettlementStatus,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
} from '../types/OfficePool';
import { PODIUM_KEYS, PodiumKey, useOfficePoolPageData } from './useOfficePoolPageData';
import '../styles/pages.scss';

interface TeamOption {
  id: string;
  name: string;
  logo: string;
}

interface GroupQualifierCard {
  groupKey: string;
  label: string;
  teams: TeamOption[];
  qualifierSlotKeys: GroupQualifierSlotKey[];
}

interface MatchPickWindow {
  id: string;
  label: string;
  matchCount: number;
  matches: OfficePoolPredictionSummary[];
}

interface WorldCupModeConfig {
  mode: OfficePoolMode;
  title: string;
  badge: string;
  description: string;
  championPickLabel: string;
  startsAt: string;
  endsAt: string;
  isLocked?: boolean;
  lockedMessage?: string;
}

function startOfDayIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endOfDayIso(value: string) {
  return `${value}T23:59:59.999Z`;
}

const utcDateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const utcDateTimeFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

const GROUP_QUALIFIER_SLOT_KEYS = ['FIRST', 'SECOND', 'THIRD'] as const;
const WORLD_CUP_GROUP_STAGE_QUALIFIER_COUNT_BY_GROUP: Record<string, number> = {
  GROUP_A: 3,
  GROUP_B: 3,
  GROUP_C: 2,
  GROUP_D: 3,
  GROUP_E: 3,
  GROUP_F: 3,
  GROUP_G: 3,
  GROUP_H: 2,
  GROUP_I: 2,
  GROUP_J: 3,
  GROUP_K: 3,
  GROUP_L: 2,
};
type GroupQualifierSlotKey = typeof GROUP_QUALIFIER_SLOT_KEYS[number];

const WORLD_CUP_MODE_CONFIG: WorldCupModeConfig[] = [
  {
    mode: 'WORLD_CUP_GROUP_STAGE',
    title: 'World Cup Group Stage',
    badge: 'Incoming',
    description: 'Play the 2026 World Cup opening phase with group-stage match picks and the required qualifying places for every group.',
    championPickLabel: 'Players choose Champion Picks for the required qualifying places in each group before joining. Those Champion Picks lock immediately after join.',
    startsAt: '2026-06-11',
    endsAt: '2026-06-27',
  },
  {
    mode: 'WORLD_CUP_KNOCKOUT_STAGE',
    title: 'World Cup Knockout Stage',
    badge: 'Locked',
    description: 'Run a knockout-only pool once the bracket begins, with high-stakes match picks and final podium selections.',
    championPickLabel: 'Players choose Champion Picks for 1st, 2nd, and 3rd before joining. Those Champion Picks lock immediately after join.',
    startsAt: '2026-06-29',
    endsAt: '2026-07-19',
    isLocked: true,
    lockedMessage: 'Starts Jun 29',
  },
];

const WORLD_CUP_MODE_CONFIG_MAP = Object.fromEntries(
  WORLD_CUP_MODE_CONFIG.map((item) => [item.mode, item]),
) as Record<OfficePoolMode, WorldCupModeConfig>;

function formatDateTime(value: string) {
  const date = new Date(value);
  return utcDateTimeFormatter.format(date);
}

function formatDate(value: string) {
  return utcDateFormatter.format(new Date(startOfDayIso(value)));
}

function formatDateWindowLabel(value: string) {
  return utcDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function getGroupQualifierSlotKeys(groupKey: string): GroupQualifierSlotKey[] {
  const qualifierCount = WORLD_CUP_GROUP_STAGE_QUALIFIER_COUNT_BY_GROUP[groupKey] ?? 2;
  return GROUP_QUALIFIER_SLOT_KEYS.slice(0, qualifierCount);
}

function getGroupQualifierSidePickKey(groupKey: string, slotKey: GroupQualifierSlotKey) {
  return `${groupKey}_${slotKey}`;
}

function formatGroupQualifierSlotLabel(slotKey: GroupQualifierSlotKey) {
  switch (slotKey) {
    case 'FIRST':
      return '1st';
    case 'SECOND':
      return '2nd';
    case 'THIRD':
      return '3rd';
  }
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
    case 'SIDE_A':
      return 'Side A';
    case 'SIDE_B':
      return 'Side B';
  }
}

function getMatchPickOptions(
  mode: OfficePoolMode,
  match: OfficePoolPredictionSummary,
): Array<{ option: OfficePoolPickOption; label: string }> {
  if (mode === 'WORLD_CUP_KNOCKOUT_STAGE') {
    return [
      { option: 'SIDE_A', label: match.homeTeamName },
      { option: 'SIDE_B', label: match.awayTeamName },
    ];
  }

  return [
    { option: 'HOME', label: 'Home' },
    { option: 'DRAW', label: 'Draw' },
    { option: 'AWAY', label: 'Away' },
  ];
}

function pickFromResult(result: string): OfficePoolPickOption | null {
  if (result === 'HOME') return 'HOME';
  if (result === 'AWAY') return 'AWAY';
  if (result === 'SIDE_A') return 'SIDE_A';
  if (result === 'SIDE_B') return 'SIDE_B';
  if (result === 'TIE') return 'DRAW';
  return null;
}

function buildTeamOptions(predictions: OfficePoolPredictionSummary[]): TeamOption[] {
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

function buildGroupQualifierCards(predictions: OfficePoolPredictionSummary[]): GroupQualifierCard[] {
  const teamById = new Map<string, TeamOption>();
  const adjacency = new Map<string, Set<string>>();

  predictions.forEach((match) => {
    if (!teamById.has(match.homeTeamId)) {
      teamById.set(match.homeTeamId, {
        id: match.homeTeamId,
        name: match.homeTeamName,
        logo: match.homeTeamLogo,
      });
    }
    if (!teamById.has(match.awayTeamId)) {
      teamById.set(match.awayTeamId, {
        id: match.awayTeamId,
        name: match.awayTeamName,
        logo: match.awayTeamLogo,
      });
    }

    if (!adjacency.has(match.homeTeamId)) {
      adjacency.set(match.homeTeamId, new Set());
    }
    if (!adjacency.has(match.awayTeamId)) {
      adjacency.set(match.awayTeamId, new Set());
    }
    adjacency.get(match.homeTeamId)?.add(match.awayTeamId);
    adjacency.get(match.awayTeamId)?.add(match.homeTeamId);
  });

  const visited = new Set<string>();
  const components: Array<{ teams: TeamOption[]; firstMatchAt: number; sortKey: string }> = [];

  adjacency.forEach((_, teamId) => {
    if (visited.has(teamId)) {
      return;
    }

    const queue = [teamId];
    const teamIds: string[] = [];
    visited.add(teamId);

    while (queue.length > 0) {
      const currentTeamId = queue.shift()!;
      teamIds.push(currentTeamId);

      (adjacency.get(currentTeamId) ?? new Set<string>()).forEach((neighbour) => {
        if (visited.has(neighbour)) {
          return;
        }
        visited.add(neighbour);
        queue.push(neighbour);
      });
    }

    const teams = teamIds
      .map((currentTeamId) => teamById.get(currentTeamId))
      .filter((team): team is TeamOption => !!team)
      .sort((a, b) => a.name.localeCompare(b.name));
    const teamIdSet = new Set(teamIds);
    const firstMatchAt = predictions
      .filter((match) => teamIdSet.has(match.homeTeamId) || teamIdSet.has(match.awayTeamId))
      .reduce((min, match) => Math.min(min, new Date(match.datetime).getTime()), Number.POSITIVE_INFINITY);

    components.push({
      teams,
      firstMatchAt,
      sortKey: teams.map((team) => team.name).join('|'),
    });
  });

  return components
    .sort((a, b) => {
      if (a.firstMatchAt !== b.firstMatchAt) {
        return a.firstMatchAt - b.firstMatchAt;
      }
      return a.sortKey.localeCompare(b.sortKey);
    })
    .map((component, index) => ({
      groupKey: `GROUP_${String.fromCharCode(65 + index)}`,
      label: `Group ${String.fromCharCode(65 + index)}`,
      teams: component.teams,
      qualifierSlotKeys: getGroupQualifierSlotKeys(
        `GROUP_${String.fromCharCode(65 + index)}`,
      ),
    }));
}

function getSidePickTeamName(sidePicks: OfficePoolSidePickSummary[], type: string, key: string) {
  return sidePicks.find((sidePick) => sidePick.type === type && sidePick.key === key)?.teamName ?? null;
}

function buildMatchPickWindows(predictions: OfficePoolPredictionSummary[]): MatchPickWindow[] {
  const matchesByDate = new Map<string, OfficePoolPredictionSummary[]>();

  predictions.forEach((match) => {
    const dateKey = match.datetime.slice(0, 10);
    const currentMatches = matchesByDate.get(dateKey) ?? [];
    currentMatches.push(match);
    matchesByDate.set(dateKey, currentMatches);
  });

  return Array.from(matchesByDate.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([dateKey, matches]) => ({
      id: dateKey,
      label: formatDateWindowLabel(dateKey),
      matchCount: matches.length,
      matches: matches.sort(
        (left, right) =>
          new Date(left.datetime).getTime() - new Date(right.datetime).getTime(),
      ),
    }));
}

function buildGroupMatchWindows(
  predictions: OfficePoolPredictionSummary[],
  groupCards: GroupQualifierCard[],
): MatchPickWindow[] {
  return groupCards.map((groupCard) => {
    const teamIds = new Set(groupCard.teams.map((team) => team.id));
    const matches = predictions
      .filter(
        (match) =>
          teamIds.has(match.homeTeamId) && teamIds.has(match.awayTeamId),
      )
      .sort(
        (left, right) =>
          new Date(left.datetime).getTime() - new Date(right.datetime).getTime(),
      );

    return {
      id: groupCard.groupKey,
      label: groupCard.label,
      matchCount: matches.length,
      matches,
    };
  });
}

function getKnockoutRoundOrder(roundLabel?: string | null) {
  const normalizedRound = (roundLabel ?? '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalizedRound.includes('round of 32')) return 1;
  if (normalizedRound.includes('round of 16')) return 2;
  if (normalizedRound.includes('quarter')) return 3;
  if (normalizedRound.includes('semi')) return 4;
  if (normalizedRound.includes('3rd') || normalizedRound.includes('third place')) return 5;
  if (normalizedRound === 'final' || normalizedRound.endsWith(' final')) return 6;
  return 99;
}

function buildKnockoutMatchWindows(
  predictions: OfficePoolPredictionSummary[],
): MatchPickWindow[] {
  const matchesByRound = new Map<string, OfficePoolPredictionSummary[]>();

  predictions.forEach((match) => {
    const roundKey = match.roundLabel?.trim() || match.datetime.slice(0, 10);
    const currentMatches = matchesByRound.get(roundKey) ?? [];
    currentMatches.push(match);
    matchesByRound.set(roundKey, currentMatches);
  });

  return Array.from(matchesByRound.entries())
    .sort(([leftRound], [rightRound]) => {
      const roundDelta = getKnockoutRoundOrder(leftRound) - getKnockoutRoundOrder(rightRound);
      if (roundDelta !== 0) {
        return roundDelta;
      }
      return leftRound.localeCompare(rightRound);
    })
    .map(([roundKey, matches]) => ({
      id: roundKey,
      label: roundKey,
      matchCount: matches.length,
      matches: matches.sort(
        (left, right) =>
          new Date(left.datetime).getTime() - new Date(right.datetime).getTime(),
      ),
    }));
}

function getJoinSidePickCount(mode: OfficePoolMode, groupCards: GroupQualifierCard[], joinSidePickMap: Record<string, string>) {
  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return groupCards.reduce(
      (count, groupCard) =>
        count +
        groupCard.qualifierSlotKeys.reduce(
          (groupCount, slotKey) =>
            groupCount +
            (joinSidePickMap[getGroupQualifierSidePickKey(groupCard.groupKey, slotKey)] ? 1 : 0),
          0,
        ),
      0,
    );
  }

  return PODIUM_KEYS.reduce((count, key) => count + (joinSidePickMap[key] ? 1 : 0), 0);
}

function getRequiredJoinSidePickCount(mode: OfficePoolMode, groupCards: GroupQualifierCard[]) {
  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return groupCards.reduce(
      (count, groupCard) => count + groupCard.qualifierSlotKeys.length,
      0,
    );
  }

  return PODIUM_KEYS.length;
}

function buildJoinSidePickPayload(
  mode: OfficePoolMode,
  groupCards: GroupQualifierCard[],
  joinSidePickMap: Record<string, string>,
) {
  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return groupCards.flatMap((groupCard) =>
      groupCard.qualifierSlotKeys.map((slotKey) => ({
        type: 'GROUP_QUALIFIER' as const,
        key: getGroupQualifierSidePickKey(groupCard.groupKey, slotKey),
        teamId: joinSidePickMap[getGroupQualifierSidePickKey(groupCard.groupKey, slotKey)],
      })),
    );
  }

  return PODIUM_KEYS.map((key) => ({
    type: 'PODIUM' as const,
    key,
    teamId: joinSidePickMap[key],
  }));
}

function getLockedSidePickTitle() {
  return 'Champion Picks';
}

function getLockedSidePickLines(
  mode: OfficePoolMode,
  sidePicks: OfficePoolSidePickSummary[],
  groupCards: GroupQualifierCard[],
) {
  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return groupCards
      .map((groupCard) => {
        const slotLines = groupCard.qualifierSlotKeys
          .map((slotKey) => {
            const teamName = getSidePickTeamName(
              sidePicks,
              'GROUP_QUALIFIER',
              getGroupQualifierSidePickKey(groupCard.groupKey, slotKey),
            );
            if (!teamName) {
              return null;
            }
            return `${formatGroupQualifierSlotLabel(slotKey)}: ${teamName}`;
          })
          .filter((line): line is string => !!line);
        if (slotLines.length !== groupCard.qualifierSlotKeys.length) {
          return null;
        }
        return `${groupCard.label}: ${slotLines.join(' / ')}`;
      })
      .filter((line): line is string => !!line);
  }

  return PODIUM_KEYS
    .map((key) => {
      const teamName = getSidePickTeamName(sidePicks, 'PODIUM', key);
      if (!teamName) {
        return null;
      }
      const label = key === 'FIRST' ? '1st' : key === 'SECOND' ? '2nd' : '3rd';
      return `${label}: ${teamName}`;
    })
    .filter((line): line is string => !!line);
}

function getSidePickComparisonLines(
  mode: OfficePoolMode,
  userSidePicks: OfficePoolSidePickSummary[],
  resolvedSidePicks: OfficePoolSidePickSummary[],
  groupCards: GroupQualifierCard[],
) {
  if (resolvedSidePicks.length === 0) {
    return [];
  }

  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return groupCards
      .map((groupCard) => {
        const comparisons = groupCard.qualifierSlotKeys
          .map((slotKey) => {
            const key = getGroupQualifierSidePickKey(groupCard.groupKey, slotKey);
            const userTeam = getSidePickTeamName(userSidePicks, 'GROUP_QUALIFIER', key);
            const resolvedTeam = getSidePickTeamName(
              resolvedSidePicks,
              'GROUP_QUALIFIER',
              key,
            );
            if (!resolvedTeam) {
              return null;
            }
            return {
              label: formatGroupQualifierSlotLabel(slotKey),
              userTeam,
              resolvedTeam,
            };
          })
          .filter(
            (
              comparison,
            ): comparison is {
              label: string;
              userTeam: string | null;
              resolvedTeam: string;
            } => !!comparison,
          );

        if (comparisons.length !== groupCard.qualifierSlotKeys.length) {
          return null;
        }

        const isCorrect = comparisons.every(
          (comparison) => comparison.userTeam === comparison.resolvedTeam,
        );
        const userLine = comparisons
          .map((comparison) => `${comparison.label}: ${comparison.userTeam ?? '-'}`)
          .join(' / ');
        const actualLine = comparisons
          .map((comparison) => `${comparison.label}: ${comparison.resolvedTeam}`)
          .join(' / ');
        return `${groupCard.label}: ${userLine} · Actual: ${actualLine}${isCorrect ? ' · Correct' : ''}`;
      })
      .filter((line): line is string => !!line);
  }

  return PODIUM_KEYS
    .map((key) => {
      const label = key === 'FIRST' ? '1st' : key === 'SECOND' ? '2nd' : '3rd';
      const userTeam = getSidePickTeamName(userSidePicks, 'PODIUM', key);
      const resolvedTeam = getSidePickTeamName(resolvedSidePicks, 'PODIUM', key);
      if (!resolvedTeam) {
        return null;
      }

      const isCorrect = userTeam === resolvedTeam;
      return `${label}: ${userTeam ?? '-'} · Actual: ${resolvedTeam}${isCorrect ? ' · Correct' : ''}`;
    })
    .filter((line): line is string => !!line);
}

function getSettlementCopy(status: OfficePoolSettlementStatus, totalPrizePool: number) {
  switch (status) {
    case 'READY':
      return `All matches are settled. The pool creator can now queue the ${totalPrizePool} PICK payout.`;
    case 'PENDING':
      return 'Settlement has been triggered and payout transactions are currently processing.';
    case 'COMPLETED':
      return 'Settlement is complete and all payout transactions succeeded.';
    case 'FAILED':
      return 'Settlement was triggered, but payout transactions failed and need reconciliation.';
    case 'PARTIAL':
      return 'Some payout transactions succeeded while others still need retry or reconciliation.';
    case 'NO_PAID_ENTRIES':
      return 'No successful paid entries were recorded, so there is no prize payout to queue.';
    case 'NOT_READY':
    default:
      return 'Settlement stays manual. Once every match in this pool window is final, the creator can settle it from here.';
  }
}

function getScoringCopy(mode: OfficePoolMode) {
  if (mode === 'WORLD_CUP_GROUP_STAGE') {
    return 'Scoring: every correct group match result is 2 points. Positional qualifier picks score 4 / 3 / 2 for 1st / 2nd / 3rd.';
  }

  return 'Scoring: Round of 32 winners are 2 points, Round of 16 winners are 4 points, Quarter-finals are 8 points, Semi-finals are 16 points, the Final is 32 points, the third-place playoff is 24 points, and podium picks score 32 / 16 / 8 for 1st / 2nd / 3rd.';
}

function CreatorDashboard({
  leaderboard,
  isSaving,
  onSettle,
}: {
  leaderboard: NonNullable<ReturnType<typeof useOfficePoolPageData>['leaderboard']>;
  isSaving: boolean;
  onSettle: () => void;
}) {
  return (
    <section className="office-pool-panel">
      <div className="office-pool-panel-head">
        <h2>Creator Dashboard</h2>
        {leaderboard.settlementStatus === 'READY' ? (
          <button className="predict-button office-pool-inline-btn" onClick={onSettle} disabled={isSaving}>
            {isSaving ? 'Settling...' : 'Settle Pool'}
          </button>
        ) : null}
      </div>
      <p className="office-pool-copy">
        Prize pool: {leaderboard.totalPrizePool} PICK
      </p>
      <p className="office-pool-copy">
        {getSettlementCopy(leaderboard.settlementStatus, leaderboard.totalPrizePool)}
      </p>
    </section>
  );
}

export default function OfficePoolPage() {
  const {
    screen,
    setScreen,
    isLoading,
    isPoolLoading,
    isSaving,
    error,
    notice,
    allPools,
    myPools,
    activePoolId,
    activePool,
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
    handleJoinPool: submitJoinPool,
    handleSavePicks,
    handleSettlePool,
    handleShareGroupLink,
  } = useOfficePoolPageData(WORLD_CUP_MODE_CONFIG_MAP);
  const [activeMatchWindowIndex, setActiveMatchWindowIndex] = useState(0);

  const availableTeams = useMemo(() => buildTeamOptions(predictions), [predictions]);
  const groupQualifierCards = useMemo(
    () => (activePool?.mode === 'WORLD_CUP_GROUP_STAGE' ? buildGroupQualifierCards(predictions) : []),
    [activePool?.mode, predictions],
  );
  const activeGroupCard = groupQualifierCards[activeQualifierGroupIndex] ?? null;
  const joinSidePickCount = useMemo(
    () => (activePool ? getJoinSidePickCount(activePool.mode, groupQualifierCards, joinSidePickMap) : 0),
    [activePool, groupQualifierCards, joinSidePickMap],
  );
  const requiredJoinSidePickCount = useMemo(
    () => (activePool ? getRequiredJoinSidePickCount(activePool.mode, groupQualifierCards) : 0),
    [activePool, groupQualifierCards],
  );
  const matchPickWindows = useMemo(() => {
    if (activePool?.mode === 'WORLD_CUP_GROUP_STAGE') {
      return buildGroupMatchWindows(predictions, groupQualifierCards);
    }

    if (activePool?.mode === 'WORLD_CUP_KNOCKOUT_STAGE') {
      return buildKnockoutMatchWindows(predictions);
    }

    return buildMatchPickWindows(predictions);
  }, [activePool?.mode, groupQualifierCards, predictions]);
  const activeMatchWindow = matchPickWindows[activeMatchWindowIndex] ?? null;
  const isJoinReady = !!activePool && requiredJoinSidePickCount > 0 && joinSidePickCount === requiredJoinSidePickCount;
  const lockedSidePickLines = useMemo(
    () => (activePool ? getLockedSidePickLines(activePool.mode, sidePicks, groupQualifierCards) : []),
    [activePool, groupQualifierCards, sidePicks],
  );
  const sidePickComparisonLines = useMemo(
    () => (
      activePool
        ? getSidePickComparisonLines(
            activePool.mode,
            sidePicks,
            leaderboard?.resolvedSidePicks ?? [],
            groupQualifierCards,
          )
        : []
    ),
    [activePool, groupQualifierCards, leaderboard?.resolvedSidePicks, sidePicks],
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
  const createWindowLabel = `${formatDate(createStart)} - ${formatDate(createEnd)} UTC`;

  useEffect(() => {
    if (activeQualifierGroupIndex < groupQualifierCards.length) {
      return;
    }
    setActiveQualifierGroupIndex(0);
  }, [activeQualifierGroupIndex, groupQualifierCards.length]);

  useEffect(() => {
    if (activeMatchWindowIndex < matchPickWindows.length) {
      return;
    }
    setActiveMatchWindowIndex(0);
  }, [activeMatchWindowIndex, matchPickWindows.length]);

  useEffect(() => {
    setActiveMatchWindowIndex(0);
  }, [activePoolId, screen]);

  const handlePickChange = (predictionId: string, option: OfficePoolPickOption) => {
    setPicks((prev) => ({
      ...prev,
      [predictionId]: option,
    }));
  };

  const handleGroupQualifierPick = (
    groupKey: string,
    slot: GroupQualifierSlotKey,
    teamId: string,
  ) => {
    const slotKeys = getGroupQualifierSlotKeys(groupKey);

    setJoinSidePickMap((prev) => {
      const next = { ...prev };
      const currentKey = getGroupQualifierSidePickKey(groupKey, slot);

      next[currentKey] = teamId;
      slotKeys.forEach((slotKey) => {
        const sidePickKey = getGroupQualifierSidePickKey(groupKey, slotKey);
        if (slotKey !== slot && next[sidePickKey] === teamId) {
          next[sidePickKey] = '';
        }
      });
      return next;
    });
  };

  const handlePodiumPick = (slot: PodiumKey, teamId: string) => {
    setJoinSidePickMap((prev) => {
      const next = { ...prev };
      PODIUM_KEYS.forEach((currentKey) => {
        if (currentKey !== slot && next[currentKey] === teamId) {
          next[currentKey] = '';
        }
      });
      next[slot] = teamId;
      return next;
    });
  };

  const handleJoinPool = async () => {
    if (!activePool || !isJoinReady) return;

    await submitJoinPool(
      buildJoinSidePickPayload(activePool.mode, groupQualifierCards, joinSidePickMap),
    );
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
              <p>{isScopedLaunch ? 'Choose the World Cup stage, open the pool for your group, then each player joins with locked Champion Picks.' : 'Open a pool you already joined from Telegram group chat.'}</p>
            </div>
            {isScopedLaunch && canCreateScopedPool ? (
              <button className="predict-button office-pool-cta" onClick={() => setScreen('create')}>
                Create Pool
              </button>
            ) : null}
          </section>

          {isScopedLaunch && !canCreateScopedPool ? (
            <section className="office-pool-panel">
              <p className="office-pool-copy">
                Only Telegram group admins can create a new Office Pool for this group. You can still join any pool that an admin opens here.
              </p>
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

      {screen === 'create' && canCreateScopedPool && (
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
                    className={`office-pool-mode-card ${createMode === mode.mode ? 'office-pool-mode-card-active' : ''} ${mode.isLocked ? 'office-pool-mode-card-locked' : ''}`}
                    onClick={() => {
                      if (mode.isLocked) return;
                      setCreateMode(mode.mode);
                    }}
                    disabled={mode.isLocked}
                  >
                    <div className="office-pool-mode-head">
                      <strong>{mode.title}</strong>
                      <span>{mode.badge}</span>
                    </div>
                    <p>{mode.description}</p>
                    <div className="office-pool-mode-meta">
                      <span>{formatDate(mode.startsAt)} - {formatDate(mode.endsAt)}</span>
                      {mode.lockedMessage ? <span>{mode.lockedMessage}</span> : null}
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
                <p className="office-pool-copy">{createModeConfig.championPickLabel}</p>
                <p className="office-pool-copy">Every player pays at least this many PICK to enter, so the prize pool grows as more friends join.</p>
                <p className="office-pool-copy">
                  Creating the pool is free for the group creator. You only pay when you join as a player.
                  {createWindowDays ? ` Pool window: ${createWindowDays} day${createWindowDays > 1 ? 's' : ''}.` : ''}
                </p>
              </div>
              <button className="predict-button" onClick={handleCreatePool} disabled={isSaving || !!createModeConfig.isLocked}>
                {isSaving ? 'Creating...' : createModeConfig.isLocked ? (createModeConfig.lockedMessage ?? 'Locked') : 'Create Pool'}
              </button>
            </div>
          </section>
        </>
      )}

      {(screen === 'detail' || screen === 'picks') && (
        <>
          <PageTopBar
            title={
              isPoolLoading
                ? screen === 'detail'
                  ? 'Loading Pool'
                  : 'Loading Picks'
                : screen === 'detail'
                  ? activePool?.name ?? 'Office Pool'
                  : 'Match Picks'
            }
            subtitle={
              isPoolLoading
                ? 'Fetching the latest pool data'
                : screen === 'detail'
                  ? getModeLabel(activePool?.mode ?? 'WORLD_CUP_GROUP_STAGE')
                  : activePool?.name
            }
            backLabel={screen === 'detail' ? 'Dashboard' : 'Pool'}
            onBack={() => (screen === 'detail' ? goHome() : setScreen('detail'))}
          />
          {notice && <div className="office-pool-notice">{notice}</div>}
          {error && <div className="office-pool-error">{error}</div>}

          {isPoolLoading || !activePool || activePool.id !== activePoolId ? (
            <div className="loading">
              {screen === 'detail'
                ? 'Loading the latest pool view...'
                : 'Loading the latest picks...'}
            </div>
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
                      <div><span>Share</span><strong>{activePool.telegramGroupInviteUrl ? 'Group link ready' : 'Share manually'}</strong></div>
                      <div><span>Joined</span><strong>{activePool.participants} players</strong></div>
                      <div><span>Minimum entry</span><strong>{activePool.entryFee} PICK</strong></div>
                      <div><span>Window (UTC)</span><strong>{formatDateTime(activePool.startsAt)} - {formatDateTime(activePool.endsAt)}</strong></div>
                      <div><span>Format</span><strong>{getModeLabel(activePool.mode)}</strong></div>
                    </div>
                    <div className="office-pool-form office-pool-share-block">
                      <p className="office-pool-copy">
                        {activePool.telegramGroupInviteUrl
                          ? `Share the Telegram group for ${activePool.telegramGroupName ?? 'this pool'}. New players can join the group first, then open `
                          : `Share your Telegram group link with new players so they can join the group, then open `}
                        <strong>/officepool</strong>
                        {!activePool.telegramGroupInviteUrl ? ' to start playing this pool.' : '.'}
                      </p>
                      {activePool.telegramGroupInviteUrl ? (
                        <div className="office-pool-panel-actions">
                          <button
                            className="predict-button office-pool-inline-btn"
                            onClick={handleShareGroupLink}
                            type="button"
                          >
                            Share Group Link
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  {!activePool.isMember ? (
                    <>
                      <section className="office-pool-panel">
                        <h2>Join Pool</h2>
                        <p className="office-pool-copy">
                          {activePool.mode === 'WORLD_CUP_GROUP_STAGE'
                            ? 'Choose your Champion Picks for the required qualifying places in every group before you join. These Champion Picks lock immediately after join.'
                            : 'Choose your Champion Picks for final 1st, 2nd, and 3rd place before you join. These Champion Picks lock immediately after join.'}
                        </p>
                        {isJoinTemporarilyLocked ? (
                          <p className="office-pool-copy">
                            World Cup Knockout Stage is locked for now. It will start on Jun 29 UTC.
                          </p>
                        ) : null}
                        {activePool.mode === 'WORLD_CUP_GROUP_STAGE' ? (
                          <GroupQualifierPicker
                            activeGroupCard={activeGroupCard}
                            activeIndex={activeQualifierGroupIndex}
                            totalGroups={groupQualifierCards.length}
                            joinSidePickMap={joinSidePickMap}
                            onBack={() => setActiveQualifierGroupIndex((current) => Math.max(0, current - 1))}
                            onNext={() => setActiveQualifierGroupIndex((current) => Math.min(groupQualifierCards.length - 1, current + 1))}
                            onPick={handleGroupQualifierPick}
                          />
                        ) : (
                          <PodiumPicker
                            teams={availableTeams}
                            activeSlot={activePodiumKey}
                            joinSidePickMap={joinSidePickMap}
                            onSlotChange={setActivePodiumKey}
                            onPick={handlePodiumPick}
                          />
                        )}
                        <button className="predict-button" onClick={handleJoinPool} disabled={!isJoinReady || isSaving || isJoinTemporarilyLocked}>
                          {isSaving ? 'Joining...' : 'Join Pool'}
                        </button>
                        <p className="office-pool-copy">
                          Champion Picks selected: {joinSidePickCount}/{requiredJoinSidePickCount}
                        </p>
                      </section>

                      {activePool.isCreator && leaderboard ? (
                        <CreatorDashboard
                          leaderboard={leaderboard}
                          isSaving={isSaving}
                          onSettle={handleSettlePool}
                        />
                      ) : null}
                    </>
                  ) : (
                    <>
                      {activePool.isCreator && leaderboard ? (
                        <CreatorDashboard
                          leaderboard={leaderboard}
                          isSaving={isSaving}
                          onSettle={handleSettlePool}
                        />
                      ) : null}

                      <section className="office-pool-panel">
                        <h2>Your Entry</h2>
                        <div className="office-pool-entry-card">
                          <div>
                            <span className="office-pool-copy-label">{getLockedSidePickTitle()}</span>
                            <strong>{lockedSidePickLines.length > 0 ? `${lockedSidePickLines.length} saved` : 'Saved on join'}</strong>
                          </div>
                          <div>
                            <span className="office-pool-copy-label">Share Link</span>
                            <strong>{activePool.telegramGroupInviteUrl ? 'Group share ready' : 'Share manually'}</strong>
                          </div>
                        </div>
                        {lockedSidePickLines.length > 0 ? (
                          <div className="office-pool-member-list">
                            {lockedSidePickLines.map((line) => (
                              <div key={line} className="office-pool-member-row">
                                <span>{line}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <p className="office-pool-copy">
                          These Champion Picks are locked after you join the pool. Normal match picks stay editable until each match locks.
                        </p>
                        {!activePool.telegramGroupInviteUrl ? (
                          <p className="office-pool-copy">
                            Share your Telegram group link with friends so they can join the group, then open <strong>/officepool</strong> to play this pool.
                          </p>
                        ) : null}
                        {sidePickComparisonLines.length > 0 ? (
                          <>
                            <p className="office-pool-copy">
                              Official settled Champion Picks:
                            </p>
                            <div className="office-pool-member-list">
                              {sidePickComparisonLines.map((line) => (
                                <div key={line} className="office-pool-member-row">
                                  <span>{line}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </section>

                      <section className="office-pool-panel">
                        <div className="office-pool-panel-head">
                          <h2>Prize Pool</h2>
                          <div className="office-pool-panel-actions">
                            <span className="office-pool-progress">{leaderboard?.totalPrizePool ?? 0} PICK</span>
                            {activePool.isCreator && leaderboard?.settlementStatus === 'READY' ? (
                              <button className="predict-button office-pool-inline-btn" onClick={handleSettlePool} disabled={isSaving}>
                                {isSaving ? 'Settling...' : 'Settle Pool'}
                              </button>
                            ) : null}
                          </div>
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
                        <p className="office-pool-copy">
                          {getSettlementCopy(leaderboard?.settlementStatus ?? 'NOT_READY', leaderboard?.totalPrizePool ?? 0)}
                        </p>
                        <p className="office-pool-copy">
                          {getScoringCopy(activePool.mode)}
                        </p>
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
                                      {entry.matchPoints} match pts · {entry.sidePickPoints} Champion Pick pts
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
                              <span>{activePool.mode === 'WORLD_CUP_KNOCKOUT_STAGE' ? (member.championPickTeamName ?? 'Champion Picks saved') : 'Champion Picks locked'}</span>
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
                      <p className="office-pool-copy">
                        {activePool.mode === 'WORLD_CUP_KNOCKOUT_STAGE'
                          ? 'Choose the team that advances from each knockout match.'
                          : 'Choose Home, Draw, or Away for each match window.'}
                      </p>
                    </div>
                    <button className="predict-button office-pool-inline-btn" onClick={handleSavePicks} disabled={isSaving || !activePool.isMember}>
                      {isSaving ? 'Saving...' : 'Save Picks'}
                    </button>
                  </div>
                  {!activePool.isMember ? (
                    <div className="empty"><p>Join this pool first.</p></div>
                  ) : predictions.length === 0 ? (
                    <div className="empty"><p>No matches available for this pool window.</p></div>
                  ) : !activeMatchWindow ? (
                    <div className="empty"><p>No match windows available for this pool yet.</p></div>
                  ) : (
                    <>
                      <div className="office-pool-panel-head">
                        <div>
                          <h2>{activeMatchWindow.label}</h2>
                          <p className="office-pool-copy">
                            {activePool.mode === 'WORLD_CUP_GROUP_STAGE'
                              ? 'Group'
                              : activePool.mode === 'WORLD_CUP_KNOCKOUT_STAGE'
                                ? 'Round'
                                : 'Match window'} {activeMatchWindowIndex + 1}/{matchPickWindows.length} · {activeMatchWindow.matchCount} matches
                          </p>
                        </div>
                      </div>
                      <div className="office-pool-inline-row office-pool-inline-row-equal">
                        <button
                          className="predict-button office-pool-inline-btn"
                          onClick={() => setActiveMatchWindowIndex((current) => Math.max(current - 1, 0))}
                          disabled={activeMatchWindowIndex === 0}
                        >
                          Previous
                        </button>
                        <button
                          className="predict-button office-pool-inline-btn"
                          onClick={() => setActiveMatchWindowIndex((current) => Math.min(current + 1, matchPickWindows.length - 1))}
                          disabled={activeMatchWindowIndex >= matchPickWindows.length - 1}
                        >
                          Next
                        </button>
                      </div>
                      <div className="office-pool-match-list">
                      {activeMatchWindow.matches.map((match) => {
                        const resultPick = pickFromResult(match.result);
                        const myPick = picks[match.id];
                        const pickOptions = getMatchPickOptions(activePool.mode, match);
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
                              {pickOptions.map(({ option, label }) => (
                                <button
                                  key={option}
                                  className={`office-pool-pick-btn ${myPick === option ? 'office-pool-pick-selected' : ''} ${resultPick === option && match.isLocked ? 'office-pool-pick-result' : ''}`}
                                  onClick={() => handlePickChange(match.id, option)}
                                  disabled={match.isLocked}
                                >
                                  {label || getPickLabel(option)}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </>
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

function PageTopBar({
  title,
  subtitle,
  backLabel = 'Back',
  onBack,
}: {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack: () => void;
}) {
  return (
    <div className="office-pool-topbar">
      <button className="office-pool-back" onClick={onBack}>{backLabel}</button>
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

function GroupQualifierPicker({
  activeGroupCard,
  activeIndex,
  totalGroups,
  joinSidePickMap,
  onBack,
  onNext,
  onPick,
}: {
  activeGroupCard: GroupQualifierCard | null;
  activeIndex: number;
  totalGroups: number;
  joinSidePickMap: Record<string, string>;
  onBack: () => void;
  onNext: () => void;
  onPick: (groupKey: string, slot: GroupQualifierSlotKey, teamId: string) => void;
}) {
  if (!activeGroupCard) {
    return <div className="empty"><p>No eligible teams found for this pool yet.</p></div>;
  }

  return (
    <>
      <div className="office-pool-panel-head">
        <div>
          <h2>Group Qualifiers</h2>
          <p className="office-pool-copy">{activeGroupCard.label} · {activeIndex + 1}/{totalGroups}</p>
        </div>
      </div>
      <div className="office-pool-inline-row office-pool-inline-row-equal">
        <button className="predict-button office-pool-inline-btn" onClick={onBack} disabled={activeIndex === 0}>Previous</button>
        <button className="predict-button office-pool-inline-btn" onClick={onNext} disabled={activeIndex >= totalGroups - 1}>Next</button>
      </div>
      <div className="office-pool-champion-grid">
        {activeGroupCard.teams.map((team) => (
          <div key={team.id} className="office-pool-champion-card">
            <img src={team.logo} alt={team.name} />
            <strong>{team.name}</strong>
            <div className="office-pool-pick-row office-pool-sidepick-row">
              {activeGroupCard.qualifierSlotKeys.map((slotKey) => {
                const sidePickKey = getGroupQualifierSidePickKey(
                  activeGroupCard.groupKey,
                  slotKey,
                );
                return (
                  <button
                    key={slotKey}
                    className={`office-pool-pick-btn ${joinSidePickMap[sidePickKey] === team.id ? 'office-pool-pick-selected' : ''}`}
                    onClick={() => onPick(activeGroupCard.groupKey, slotKey, team.id)}
                    type="button"
                  >
                    {formatGroupQualifierSlotLabel(slotKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PodiumPicker({
  teams,
  activeSlot,
  joinSidePickMap,
  onSlotChange,
  onPick,
}: {
  teams: TeamOption[];
  activeSlot: PodiumKey;
  joinSidePickMap: Record<string, string>;
  onSlotChange: (slot: PodiumKey) => void;
  onPick: (slot: PodiumKey, teamId: string) => void;
}) {
  if (teams.length === 0) {
    return <div className="empty"><p>No eligible teams found for this pool yet.</p></div>;
  }

  return (
    <>
      <div className="office-pool-panel-head">
        <div>
          <h2>Final Podium</h2>
          <p className="office-pool-copy">Choose a slot, then tap a team.</p>
        </div>
      </div>
      <div className="office-pool-pick-row">
        {PODIUM_KEYS.map((slot) => (
          <button
            key={slot}
            className={`office-pool-pick-btn ${activeSlot === slot ? 'office-pool-pick-selected' : ''}`}
            onClick={() => onSlotChange(slot)}
            type="button"
          >
            {slot === 'FIRST' ? '1st' : slot === 'SECOND' ? '2nd' : '3rd'}
          </button>
        ))}
      </div>
      <div className="office-pool-champion-grid">
        {teams.map((team) => {
          const teamTakenByOtherSlot = PODIUM_KEYS.some((slot) => slot !== activeSlot && joinSidePickMap[slot] === team.id);
          return (
            <button
              key={team.id}
              className={`office-pool-champion-card ${joinSidePickMap[activeSlot] === team.id ? 'office-pool-champion-card-active' : ''}`}
              onClick={() => onPick(activeSlot, team.id)}
              disabled={teamTakenByOtherSlot}
              type="button"
            >
              <img src={team.logo} alt={team.name} />
              <strong>{team.name}</strong>
            </button>
          );
        })}
      </div>
    </>
  );
}

/*
Legacy single-team champion picker kept commented out while stage-aware
side-pick join flows replace it for World Cup office pools.
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
*/
