import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenUtils } from '../utils/token';
import { bootstrapAuth } from './auth-bootstrap';
import { Prediction, QuoteRequest, QuoteResponse } from '../types/Prediction';
import { PredictionRecord, CreatePredictionRecordRequest, CreatePredictionResult } from '../types/PredictionRecord';
import { User } from '../types/User';
import {
  CreateOfficePoolRequest,
  JoinOfficePoolRequest,
  OfficePoolJoinContext,
  OfficePoolJoinResponse,
  OfficePoolLeaderboardResponse,
  OfficePoolMemberSummary,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
  OfficePoolLevelReadiness,
  OfficePoolScopeAccess,
  OfficePoolSettlementReadiness,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
} from '../types/OfficePool';
  CustomArenaMarket,
  CustomArenaProposal,
  CustomArenaProposalResponse,
  CustomArenaScope,
  CustomArenaVoteResponse,
  CustomArenaVoteValue,
} from '../types/CustomArena';

// Create axios instance
// When served from backend at /bot/, use same origin for API calls (no CORS issues!)
// `ngrok-skip-browser-warning` short-circuits the ngrok-free interstitial that
// would otherwise return 200 with no CORS headers and break dev-env requests.
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Auth interceptor - add JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = tokenUtils.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// M7.4.6 — Response interceptor: silent JWT refresh on 401.
// The bootstrap JWT has a 1h lifetime; if a request hits 401 we re-run
// `bootstrapAuth()` (a fresh initData read + /auth/telegram/webapp call),
// swap the token, and retry the original request once. Single-flight
// guarded so a burst of 401s only refreshes once.
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const { loginProvider } = tokenUtils.getTokenData();

    // Only refresh-and-retry on 401, and only once per request. The bootstrap
    // endpoint itself must never recurse here.
    const isBootstrap =
      typeof original?.url === 'string' &&
      (original.url.includes('/auth/telegram/webapp') ||
        original.url.includes('/messenger/exchange'));
    if (status !== 401 || !original || original._retried || isBootstrap) {
      if (status === 401) {
        tokenUtils.removeToken();
        console.error('Authentication failed (no retry available)');
      }
      return Promise.reject(error);
    }

    if (loginProvider !== 'TELEGRAM') {
      tokenUtils.removeToken();
      console.error(`Authentication failed (no refresh available for ${loginProvider || 'unknown'} provider)`);
      return Promise.reject(error);
    }
    original._retried = true;

    if (isRefreshing) {
      // Park behind the in-flight refresh.
      return new Promise((resolve, reject) => {
        pendingQueue.push((newToken) => {
          if (!newToken) {
            reject(error);
            return;
          }
          original.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const newToken = await bootstrapAuth();
      pendingQueue.forEach((cb) => cb(newToken));
      pendingQueue = [];
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      pendingQueue.forEach((cb) => cb(null));
      pendingQueue = [];
      tokenUtils.removeToken();
      console.error('Authentication refresh failed', refreshErr);
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Deposit (M7.5) ────────────────────────────────────────────────────────────

export interface DepositTokenSpec {
  address: string;
  symbol: string;
  decimals: number;
  // BE-resolved authorization method (from /deposits/config). PERMIT = gasless
  // signature; FALLBACK_APPROVE = user sends an on-chain approve() and pays native gas.
  gaslessMethod: 'PERMIT' | 'FALLBACK_APPROVE';
}

export interface DepositChainSpec {
  key: string;             // rail key, e.g. 'kairos' | 'kaia'
  chainId: number;
  chainName?: string;      // display label for the chain pulldown (e.g. 'Kairos', 'KAIA')
  chainCurrency?: string;  // native gas symbol (informational)
  tokens: DepositTokenSpec[];
}

export interface DepositConfig {
  chains: DepositChainSpec[];
  pick: { address: string; decimals: number };
}

export interface DepositQuote {
  pickRawAmount: string;
  ratioWAD: string;
  ratioAgeMs: number;
}

export interface DepositSession {
  sessionId: string;
  signingUrl: string;
  ttlMs: number;
  stablecoinDepositId: string;
}

export const depositApi = {
  getConfig: async (): Promise<DepositConfig> => {
    const response = await api.get<DepositConfig>('/deposits/config');
    return response.data;
  },

  // Live PICK quote for a stablecoin amount. BE caches the ratioWAD for
  // 120 s so debounced typing doesn't hammer the chain RPC.
  getQuote: async (
    chain: string,
    tokenAddress: string,
    rawAmount: string,
  ): Promise<DepositQuote> => {
    const response = await api.get<DepositQuote>('/deposits/quote', {
      params: { chain, tokenAddress, rawAmount },
    });
    return response.data;
  },

  // Returns a signingUrl pointing at the sign-app session-load page.
  createSession: async (
    chain: string,
    tokenAddress: string,
    rawAmount: string,
  ): Promise<DepositSession> => {
    const response = await api.post<DepositSession>('/deposits/session', {
      chain,
      tokenAddress,
      rawAmount,
    });
    return response.data;
  },
};

// Prediction API
export const predictionApi = {
  getPredictionById: async (id: string): Promise<Prediction> => {
    const response = await api.get<Prediction>(`/predictions/${id}`);
    return response.data;
  },

  getUpcoming: async (): Promise<Prediction[]> => {
    // /predictions/active returns only UPCOMING + ON_GOING (server enriches just
    // those). The old /predictions enriched every finished game too and ran ~34s,
    // past Axios's 30s timeout. Keep the UPCOMING client filter for display parity.
    const response = await api.get<Prediction[]>('/predictions/active');
    return response.data.filter(p => p.status === 'UPCOMING');
  },

  // M4.2 — chain-true post-slippage quote. LMSR routes through hub.previewPredict;
  // NAIVE is BE-synthesized using the same post-bet pool-ratio formula the FE
  // used to compute locally. Replaces `calculateWin` in PredictionModal.
  getQuote: async (predictionId: string, body: QuoteRequest): Promise<QuoteResponse> => {
    const response = await api.post<QuoteResponse>(`/predictions/${predictionId}/quote`, body);
    return response.data;
  },
};

export const customArenaApi = {
  createProposal: async (
    topic: string,
    scope?: CustomArenaScope,
  ): Promise<CustomArenaProposalResponse> => {
    const response = await api.post<CustomArenaProposalResponse>('/custom-arena/proposals', {
      topic,
      scope,
    });
    return response.data;
  },
  createMarket: async (
    scope: CustomArenaScope,
    proposal: CustomArenaProposal,
  ): Promise<CustomArenaMarket> => {
    const response = await api.post<CustomArenaMarket>('/custom-arena/markets', {
      scope,
      proposal: { success: true, status: 'created', proposal },
    }, {
      timeout: 90000,
    });
    return response.data;
  },
  getGroupMarkets: async (scope: CustomArenaScope): Promise<CustomArenaMarket[]> => {
    const response = await api.get<CustomArenaMarket[]>('/custom-arena/markets', {
      params: {
        scopeProvider: scope.scopeProvider,
        scopeExternalId: scope.scopeExternalId,
      },
    });
    return response.data;
  },
  getCreatedMarkets: async (): Promise<CustomArenaMarket[]> => {
    const response = await api.get<CustomArenaMarket[]>('/custom-arena/markets/created');
    return response.data;
  },
  voteMarket: async (
    id: string,
    value: CustomArenaVoteValue,
  ): Promise<CustomArenaVoteResponse> => {
    const response = await api.post<CustomArenaVoteResponse>(`/custom-arena/markets/${id}/vote`, {
      value,
    });
    return response.data;
  },
  predictMarket: async (
    id: string,
    option: 0 | 1,
    amountPick: number,
  ): Promise<{ txHash: string }> => {
    const response = await api.post<{ txHash: string }>(`/custom-arena/markets/${id}/predict`, {
      option,
      amountPick,
    }, {
      timeout: 90000,
    });
    return response.data;
  },
  claimMarket: async (id: string): Promise<{ txHash: string; paidRaw: string }> => {
    const response = await api.post<{ txHash: string; paidRaw: string }>(
      `/custom-arena/markets/${id}/claim`,
      undefined,
      { timeout: 90000 },
    );
    return response.data;
  },
};

// Prediction Record API
export const predictionRecordApi = {
  // M6.2.d — Return type widened to a discriminated union: BE may return a
  // PendingSessionResponse (kind='pending') instead of a placed PredictionRecord
  // when the user is opted into the EOA + ERC-2771 flow. Callers MUST
  // discriminate before treating the response as a placed record — otherwise
  // the UI false-positives a success modal for an unsubmitted prediction.
  createPredictionRecord: async (data: CreatePredictionRecordRequest): Promise<CreatePredictionResult> => {
    const response = await api.post<CreatePredictionResult>('/prediction-records', data);
    return response.data;
  },

  getClaimable: async (userId: string): Promise<PredictionRecord[]> => {
    const response = await api.get(`/prediction-records?userId=${userId}`);
    const records = Array.isArray(response.data) ? response.data : [];
    return records.filter((record: any) => !record.isClaimed && record.result === 'WIN');
  },

  claimReward: async (id: string): Promise<PredictionRecord> => {
    const response = await api.put<PredictionRecord>(`/prediction-records/${id}/claim`);
    return response.data;
  },
};

// User API
export const userApi = {
  getUserById: async (id: string): Promise<User> => {
    const response = await api.get<User>(`/users/${id}`);
    return response.data;
  },
};

export const officePoolApi = {
  list: async (scope?: { scopeProvider?: string; scopeExternalId?: string }): Promise<OfficePoolSummary[]> => {
    const response = await api.get<OfficePoolSummary[]>('/office-pools', {
      params: {
        scopeProvider: scope?.scopeProvider,
        scopeExternalId: scope?.scopeExternalId,
      },
    });
    return response.data;
  },

  listMine: async (): Promise<OfficePoolSummary[]> => {
    const response = await api.get<OfficePoolSummary[]>('/office-pools/my');
    return response.data;
  },

  getScopeAccess: async (scope?: {
    scopeProvider?: string;
    scopeExternalId?: string;
  }): Promise<OfficePoolScopeAccess> => {
    const response = await api.get<OfficePoolScopeAccess>('/office-pools/scope-access', {
      params: {
        scopeProvider: scope?.scopeProvider,
        scopeExternalId: scope?.scopeExternalId,
      },
    });
    return response.data;
  },

  getById: async (id: string): Promise<OfficePoolSummary> => {
    const response = await api.get<OfficePoolSummary>(`/office-pools/${id}`);
    return response.data;
  },

  create: async (data: CreateOfficePoolRequest): Promise<OfficePoolSummary> => {
    const response = await api.post<OfficePoolSummary>('/office-pools', data);
    return response.data;
  },

  join: async (id: string, data: JoinOfficePoolRequest): Promise<OfficePoolJoinResponse> => {
    const response = await api.post<OfficePoolJoinResponse>(`/office-pools/${id}/join`, data);
    return response.data;
  },

  getJoinContext: async (id: string): Promise<OfficePoolJoinContext> => {
    const response = await api.get<OfficePoolJoinContext>(`/office-pools/${id}/join-context`);
    return response.data;
  },

  getSidePicks: async (id: string): Promise<OfficePoolSidePickSummary[]> => {
    const response = await api.get<OfficePoolSidePickSummary[]>(`/office-pools/${id}/side-picks`);
    return response.data;
  },

  getMembers: async (id: string): Promise<OfficePoolMemberSummary[]> => {
    const response = await api.get<OfficePoolMemberSummary[]>(`/office-pools/${id}/members`);
    return response.data;
  },

  getPredictions: async (id: string): Promise<OfficePoolPredictionSummary[]> => {
    const response = await api.get<OfficePoolPredictionSummary[]>(`/office-pools/${id}/predictions`);
    return response.data;
  },

  getPicks: async (id: string): Promise<Record<string, OfficePoolPickOption>> => {
    const response = await api.get<Record<string, OfficePoolPickOption>>(`/office-pools/${id}/picks/map`);
    return response.data;
  },

  savePicks: async (id: string, picks: Record<string, OfficePoolPickOption>): Promise<{ saved: number }> => {
    const response = await api.post<{ saved: number }>(`/office-pools/${id}/picks`, { picks });
    return response.data;
  },

  getLeaderboard: async (id: string): Promise<OfficePoolLeaderboardResponse> => {
    const response = await api.get<OfficePoolLeaderboardResponse>(`/office-pools/${id}/leaderboard`);
    return response.data;
  },

  settle: async (id: string): Promise<OfficePoolLeaderboardResponse> => {
    const response = await api.post<OfficePoolLeaderboardResponse>(`/office-pools/${id}/settle`);
    return response.data;
  },

  getSettlementReadiness: async (id: string): Promise<OfficePoolSettlementReadiness> => {
    const response = await api.get<OfficePoolSettlementReadiness>(`/office-pools/${id}/settlement-readiness`);
    return response.data;
  },

  // E16b live-pool readiness (E18 scoringStatus): READY ⇒ FINALIZABLE, PARTIAL ⇒ SCORING_PENDING,
  // settled ⇒ FINALIZED. This is the authoritative gate for the NORMAL finalize two-step — the E16a
  // /settlement-readiness poolLevel NEVER derives FINALIZABLE for a NORMAL knockout pool (A6).
  getLiveReadiness: async (id: string): Promise<OfficePoolLevelReadiness> => {
    const response = await api.get<OfficePoolLevelReadiness>(`/office-pools/${id}/live-readiness`);
    return response.data;
  },

  // E16b NORMAL live finalization is two-step (the owner-facing path):
  // 1) finalize-prepare — lock the pool on-chain + commit the score root (idempotent, retryable)
  // 2) finalize-live    — settle, enabling claims (guarded: requires prepare first)
  // The E16a single-shot /finalize + /settlement-preview (NORMAL/VOID_REFUND/GUARDIAN_OVERRIDE)
  // remain BE-side as the admin/guardian emergency path; they are intentionally not surfaced here.
  finalizePrepare: async (id: string): Promise<{ poolState?: string; committedRoot?: string }> => {
    const response = await api.post<{ poolState?: string; committedRoot?: string }>(
      `/office-pools/${id}/finalize-prepare`,
    );
    return response.data;
  },

  finalizeLive: async (id: string): Promise<unknown> => {
    const response = await api.post<unknown>(`/office-pools/${id}/finalize-live`);
    return response.data;
  },

  claim: async (id: string): Promise<unknown> => {
    const response = await api.post<unknown>(`/office-pools/${id}/claim`);
    return response.data;
  },
};
