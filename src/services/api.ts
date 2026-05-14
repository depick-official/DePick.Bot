import axios, { AxiosInstance } from 'axios';
import { tokenUtils } from '../utils/token';
import { Prediction } from '../types/Prediction';
import { PredictionRecord, CreatePredictionRecordRequest } from '../types/PredictionRecord';
import { User } from '../types/User';
import {
  CreateOfficePoolRequest,
  JoinOfficePoolRequest,
  OfficePoolJoinResponse,
  OfficePoolLeaderboardResponse,
  OfficePoolMemberSummary,
  OfficePoolPickOption,
  OfficePoolPredictionSummary,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
  SetOfficePoolSidePickItem,
} from '../types/OfficePool';

interface TelegramAuthVerifyRequest {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramAuthVerifyResponse {
  success: boolean;
  auth_token: string;
}

interface TelegramMiniAppVerifyRequest {
  initData: string;
}

// Create axios instance
// When served from backend at /bot/, use same origin for API calls (no CORS issues!)
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

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenUtils.removeToken();
      // For bot context, we just fail rather than redirect
      console.error('Authentication failed');
    }
    return Promise.reject(error);
  }
);

// Prediction API
export const predictionApi = {
  getPredictionById: async (id: string): Promise<Prediction> => {
    const response = await api.get<Prediction>(`/predictions/${id}`);
    return response.data;
  },

  getUpcoming: async (): Promise<Prediction[]> => {
    const response = await api.get<Prediction[]>('/predictions');
    return response.data.filter(p => p.status === 'UPCOMING');
  },
};

// Prediction Record API
export const predictionRecordApi = {
  createPredictionRecord: async (data: CreatePredictionRecordRequest): Promise<PredictionRecord> => {
    const response = await api.post<PredictionRecord>('/prediction-records', data);
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

  getById: async (id: string): Promise<OfficePoolSummary> => {
    const response = await api.get<OfficePoolSummary>(`/office-pools/${id}`);
    return response.data;
  },

  getByInviteCode: async (inviteCode: string): Promise<OfficePoolSummary> => {
    const response = await api.get<OfficePoolSummary>(`/office-pools/invite/${inviteCode}`);
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

  setChampionPick: async (id: string, championPickTeamId: string): Promise<OfficePoolMemberSummary> => {
    const response = await api.post<OfficePoolMemberSummary>(`/office-pools/${id}/champion-pick`, { championPickTeamId });
    return response.data;
  },

  getSidePicks: async (id: string): Promise<OfficePoolSidePickSummary[]> => {
    const response = await api.get<OfficePoolSidePickSummary[]>(`/office-pools/${id}/side-picks`);
    return response.data;
  },

  saveSidePicks: async (id: string, sidePicks: SetOfficePoolSidePickItem[]): Promise<OfficePoolSidePickSummary[]> => {
    const response = await api.post<OfficePoolSidePickSummary[]>(`/office-pools/${id}/side-picks`, { sidePicks });
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
};

export const telegramAuthApi = {
  verify: async (data: TelegramAuthVerifyRequest): Promise<TelegramAuthVerifyResponse> => {
    const response = await api.post<TelegramAuthVerifyResponse>('/auth/telegram/verify', data, {
      headers: {
        Authorization: undefined,
      },
    });
    return response.data;
  },

  verifyMiniApp: async (data: TelegramMiniAppVerifyRequest): Promise<TelegramAuthVerifyResponse> => {
    const response = await api.post<TelegramAuthVerifyResponse>('/auth/telegram/miniapp/verify', data, {
      headers: {
        Authorization: undefined,
      },
    });
    return response.data;
  },
};
