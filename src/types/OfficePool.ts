export type OfficePoolStatus = 'OPEN' | 'LIVE' | 'LOCKED' | 'SETTLED' | 'ARCHIVED';
export type OfficePoolAccessPolicy = 'INVITE_LOCK' | 'OPEN';
export type OfficePoolPickOption = 'HOME' | 'DRAW' | 'AWAY';

export interface OfficePoolSummary {
  id: string;
  name: string;
  creatorUserId: string;
  creatorUsername: string;
  inviteCode: string;
  status: OfficePoolStatus;
  accessPolicy: OfficePoolAccessPolicy;
  tournament: string;
  seasonKey?: string;
  startsAt: string;
  endsAt: string;
  scopeProvider?: string | null;
  scopeExternalId?: string | null;
  entryFee: number;
  maxParticipants: number;
  participants: number;
  isMember: boolean;
  createTime: string;
  updateTime: string;
}

export interface CreateOfficePoolRequest {
  name: string;
  tournament: string;
  seasonKey?: string;
  startsAt: string;
  endsAt: string;
  accessPolicy?: OfficePoolAccessPolicy;
  scopeProvider?: string;
  scopeExternalId?: string;
  entryFee?: number;
  maxParticipants?: number;
  championPickTeamId?: string;
}

export interface JoinOfficePoolRequest {
  inviteCode?: string;
  championPickTeamId?: string;
}

export interface OfficePoolMemberSummary {
  userId: string;
  displayNameSnapshot: string;
  avatarSnapshot?: string | null;
  championPickTeamId?: string | null;
  championPickTeamName?: string | null;
  createTime: string;
}

export interface OfficePoolPredictionSummary {
  id: string;
  datetime: string;
  fixture: string;
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
  totalPrizePool: number;
  payoutResolved: boolean;
}

export interface OfficePoolJoinResponse {
  pool: OfficePoolSummary;
  member: OfficePoolMemberSummary;
}
