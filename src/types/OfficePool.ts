export type OfficePoolStatus = 'OPEN' | 'LIVE' | 'LOCKED' | 'SETTLED' | 'ARCHIVED';
export type OfficePoolAccessPolicy = 'INVITE_LOCK' | 'OPEN';
export type OfficePoolPickOption = 'HOME' | 'DRAW' | 'AWAY';
export type OfficePoolMode = 'WORLD_CUP_GROUP_STAGE' | 'WORLD_CUP_KNOCKOUT_STAGE';
export type OfficePoolSidePickType = 'CHAMPION' | 'GROUP_QUALIFIER' | 'PODIUM';
export type OfficePoolSettlementStatus = 'NOT_READY' | 'READY' | 'NO_PAID_ENTRIES' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

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
  seasonKey?: string;
  startsAt: string;
  endsAt: string;
  scopeProvider?: string | null;
  scopeExternalId?: string | null;
  entryFee: number;
  participants: number;
  isMember: boolean;
  isCreator: boolean;
  createTime: string;
  updateTime: string;
}

export interface OfficePoolScopeAccess {
  canCreate: boolean;
}

export interface CreateOfficePoolRequest {
  name: string;
  mode: OfficePoolMode;
  tournament: string;
  seasonKey?: string;
  startsAt: string;
  endsAt: string;
  accessPolicy?: OfficePoolAccessPolicy;
  scopeProvider?: string;
  scopeExternalId?: string;
  entryFee: number;
  championPickTeamId?: string;
}

export interface JoinOfficePoolRequest {
  inviteCode?: string;
  championPickTeamId?: string;
  sidePicks?: SetOfficePoolSidePickItem[];
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
  result: 'HOME' | 'AWAY' | 'TIE' | 'PENDING' | 'ERROR';
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
  pool: OfficePoolSummary;
  member: OfficePoolMemberSummary;
}
