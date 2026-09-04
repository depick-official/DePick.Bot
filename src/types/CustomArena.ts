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
  displayName?: string | null;
}

export interface CustomArenaProposal {
  market_type?: string;
  question_text?: string;
  outcomes?: string[];
  yes_semantics?: string;
  no_semantics?: string;
  canonical_refs?: unknown;
  resolution_plan?: unknown;
  resolution_deadline?: string;
  resolution_rules?: string[];
  resolution_sources?: string[];
  created_at?: string;
  rationale?: string;
  [key: string]: unknown;
}

export interface CustomArenaAgentEstimate {
  agent_id: string;
  model_id: string;
  status: 'estimated' | 'abstained' | 'error';
  p_yes?: number | null;
  p_no?: number | null;
  confidence?: number | null;
  latency_ms?: number | null;
  evidence_ids: string[];
  assumptions: string[];
  missing_information: string[];
  reasoning_summary?: string | null;
  follow_up_query?: string | null;
  web_search_count: number;
  web_result_count: number;
}

export interface CustomArenaInitialOddsEstimate {
  status: 'estimated' | 'needs_review' | 'fallback' | string;
  route?: string | null;
  p_yes?: number | null;
  p_no?: number | null;
  confidence?: number | null;
  disagreement_range?: number | null;
  disagreement_standard_deviation?: number | null;
  evidence_summary?: Record<string, string | number | null> | null;
  agent_estimates?: CustomArenaAgentEstimate[] | null;
  model_roster_version?: string | null;
  calibration_version?: string | null;
  estimator_version?: string | null;
  estimated_at?: string | null;
  fallback_used?: boolean | null;
  fallback_reason?: string | null;
  warnings?: string[] | null;
  [key: string]: unknown;
}

export interface CustomArenaProposalResponse {
  success: boolean;
  status: CustomArenaCreateStatus;
  marketId?: string | null;
  proposal?: CustomArenaProposal | null;
  initial_odds?: CustomArenaInitialOddsEstimate | null;
  clarification_question?: string | null;
  suggestions?: string[];
  validation_reasoning?: string | null;
  verification_notes?: string | null;
  error?: string | null;
}

export interface CustomArenaCommunity {
  id: string;
  displayName: string;
  channels: CustomArenaScope[];
  status?: string | null;
  mode?: string | null;
}

export interface CustomArenaCommunityListResponse {
  communities: CustomArenaCommunity[];
}

export interface CustomArenaCapacity {
  totalPick: string;
  reservedPick: string;
  availablePick: string;
}

export interface CustomArenaDashboardCounts {
  active: number;
  awaitingResolution: number;
  onHold: number;
  resolved: number;
  void: number;
}

export interface CustomArenaMarket {
  yesSemantics?: string | null;
  noSemantics?: string | null;
  resolutionRules?: string[];
  voidConditions?: string[];
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
  // CA-ARCH-004 (R6) — status === 'DISPUTED' drives the On-Hold UI; disputeState
  // (NONE/HELD/CLEARED) is the finer on-chain hold signal surfaced by the BE.
  disputeState?: string;
  odds?: number[];
  collateralPick?: number;
  hasUserPosition?: boolean;
  claimStatus?: string | null;
  canClaim?: boolean;
  resolvedOutcome?: number | null;
  sourceProvider?: CustomArenaScopeProvider | null;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
  volumePick?: string;
  participantCount?: number;
  aiStatus?: string | null;
  statusReason?: string | null;
  canPredict?: boolean;
  canPredictReason?: string | null;
}

export interface CustomArenaDashboardResponse {
  community: CustomArenaCommunity;
  capacity: CustomArenaCapacity;
  counts: CustomArenaDashboardCounts;
  volumePick: string;
  participantCount: number;
  markets: CustomArenaMarket[];
}

export interface CustomArenaVoteResponse {
  upvoteCount: number;
  downvoteCount: number;
  voteScore: number;
  userVote: CustomArenaVoteValue;
}
