export type OfficePoolStatus = 'OPEN' | 'LIVE' | 'LOCKED' | 'SETTLED' | 'ARCHIVED';
export type OfficePoolAccessPolicy = 'INVITE_LOCK' | 'OPEN';
export type OfficePoolPickOption = 'HOME' | 'DRAW' | 'AWAY' | 'SIDE_A' | 'SIDE_B';
export type OfficePoolMode = 'GROUP_STAGE' | 'KNOCKOUT_STAGE';
export type OfficePoolSidePickType = 'CHAMPION' | 'GROUP_QUALIFIER' | 'PODIUM';
export type OfficePoolSettlementStatus = 'NOT_READY' | 'READY' | 'NO_PAID_ENTRIES' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
export type OfficePoolPrizeAllocationPreset = 'winner_takes_all' | 'top_4_40_30_20_10';

export interface OfficePoolSummary {
  id: string;
  name: string;
  creatorUserId: string;
  creatorUsername: string;
  inviteCode: string;
  deepLinkUrl?: string | null;
  telegramGroupName?: string | null;
  telegramGroupInviteUrl?: string | null;
  status: OfficePoolStatus;
  mode: OfficePoolMode;
  accessPolicy: OfficePoolAccessPolicy;
  tournament: string;
  season?: string;
  seasonKey?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  tQ?: string | null;
  joinClosesAt?: string | null;
  scopeProvider?: string | null;
  scopeExternalId?: string | null;
  entryFee?: number | null;
  minEntryAmount?: string | null;
  maxEntryAmount?: string | null;
  prizeAllocationPreset?: OfficePoolPrizeAllocationPreset;
  rakeBps?: number;
  lifecycleStatus?: 'CREATED' | 'OPEN' | 'LOCKED' | 'FINALIZED' | 'VOID';
  participants?: number | null;
  entrantCount?: number | null;
  isMember: boolean;
  isCreator: boolean;
  createTime: string;
  updateTime: string;
}

export interface OfficePoolScopeAccess {
  canCreate: boolean;
}

export interface CreateOfficePoolRequest {
  mode: OfficePoolMode;
  tournament: string;
  season: string;
  minEntryAmount: string;
  maxEntryAmount: string;
  prizeAllocationPreset: OfficePoolPrizeAllocationPreset;
  scopeProvider?: string;
  scopeExternalId?: string;
}

export interface JoinOfficePoolRequest {
  entryAmount: string;
  idempotencyKey: string;
  structuralPicks:
    | { kind: 'GROUP'; qualifiers: unknown[] }
    | {
        kind: 'KNOCKOUT';
        podium: {
          championTeamRef: TeamRef;
          runnerUpTeamRef: TeamRef;
          thirdTeamRef: TeamRef;
        };
      };
}

export interface TeamRef {
  teamIndex: number;
  displayName: string;
}

export type OfficePoolJoinReadiness = 'READY' | 'ROSTER_PENDING' | 'JOIN_CLOSED' | 'PAUSED';

export interface OfficePoolPodiumTeam {
  teamIndex: number;
  displayName: string;
  countryCode?: string;
  crestUrl?: string;
}

export interface OfficePoolJoinContext {
  id: string;
  mode: 'KNOCKOUT_STAGE';
  lifecycleStatus: 'OPEN' | 'PAUSED' | 'FINALIZED' | 'VOID';
  minEntryAmount: string;
  maxEntryAmount: string;
  prizeAllocationPreset: OfficePoolPrizeAllocationPreset;
  joinClosesAt: string;
  locked: boolean;
  joinReadiness: OfficePoolJoinReadiness;
  joinReadinessReason?: string;
  podiumRoster: OfficePoolPodiumTeam[];
}

export interface OfficePoolMemberSummary {
  userId: string;
  displayNameSnapshot: string;
  avatarSnapshot?: string | null;
  championPickTeamId?: string | null;
  championPickTeamName?: string | null;
  createTime: string;
}

export interface OfficePoolSidePickSummary {
  type: OfficePoolSidePickType;
  key: string;
  teamId: string;
  teamName: string;
}

export interface SetOfficePoolSidePickItem {
  type: OfficePoolSidePickType;
  key: string;
  teamId: string;
}

export interface OfficePoolPredictionSummary {
  id: string;
  datetime: string;
  fixture: string;
  roundLabel?: string | null;
  tournament: string;
  status: string;
  result: 'HOME' | 'AWAY' | 'SIDE_A' | 'SIDE_B' | 'TIE' | 'PENDING' | 'ERROR';
  homeTeamId: string;
  homeTeamName: string;
  homeTeamLogo: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamLogo: string;
  isLocked: boolean;
}

export interface OfficePoolLeaderboardEntry {
  rank: number;
  userId: string;
  displayNameSnapshot: string;
  avatarSnapshot?: string | null;
  points: number;
  correctPicks: number;
  matchPoints: number;
  sidePickPoints: number;
  championBonusPoints: number;
  championPickTeamId?: string | null;
  championPickTeamName?: string | null;
  championPickCorrect: boolean;
  prizeAmount?: number | null;
}

export interface OfficePoolLeaderboardResponse {
  pool: OfficePoolSummary;
  leaderboard: OfficePoolLeaderboardEntry[];
  completedMatches: number;
  totalMatches: number;
  championBonusPoints: number;
  championWinnerTeamId?: string | null;
  championWinnerTeamName?: string | null;
  resolvedSidePicks: OfficePoolSidePickSummary[];
  totalPrizePool: number;
  payoutResolved: boolean;
  settlementReady: boolean;
  settlementStatus: OfficePoolSettlementStatus;
}

export interface OfficePoolJoinResponse {
  pool?: OfficePoolSummary;
  member?: OfficePoolMemberSummary;
  entry?: { entryAmount: string; joinedAt: string };
  onChain?: { txHash: string | null; status: 'PENDING' | 'CONFIRMED' | 'FAILED' };
  validation?: { ok: boolean; errors: string[] };
  canonicalReadiness?: 'READY' | 'PENDING_E15';
}
