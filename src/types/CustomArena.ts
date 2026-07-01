export type CustomArenaScopeProvider = 'TELEGRAM' | 'DISCORD';
export type CustomArenaVoteValue = -1 | 0 | 1;
export type CustomArenaCreateStatus =
  | 'created'
  | 'needs_clarification'
  | 'rejected'
  | 'error';

export interface CustomArenaScope {
  scopeProvider: CustomArenaScopeProvider;
  scopeExternalId: string;
  displayName?: string;
}

export interface CustomArenaProposal {
  question_text?: string;
  outcomes?: string[];
  resolution_deadline?: string;
  resolution_rules?: string[];
  [key: string]: unknown;
}

export interface CustomArenaProposalResponse {
  success: boolean;
  status: CustomArenaCreateStatus;
  proposal?: CustomArenaProposal | null;
  clarification_question?: string | null;
  suggestions?: string[];
  error?: string | null;
}

export interface CustomArenaMarket {
  id: string;
  groupId: string;
  questionText: string;
  outcomes: string[];
  resolutionDeadline: string;
  status: string;
  upvoteCount: number;
  downvoteCount: number;
  voteScore: number;
  userVote: CustomArenaVoteValue;
  createdByMe: boolean;
  groupLabel?: string | null;
  odds?: number[];
  collateralPick?: number;
  hasUserPosition?: boolean;
  claimStatus?: string | null;
  canClaim?: boolean;
}

export interface CustomArenaVoteResponse {
  upvoteCount: number;
  downvoteCount: number;
  voteScore: number;
  userVote: CustomArenaVoteValue;
}
