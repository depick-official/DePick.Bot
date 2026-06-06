import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenUtils } from '../utils/token';
import { bootstrapAuth } from './auth-bootstrap';
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
  OfficePoolScopeAccess,
  OfficePoolSidePickSummary,
  OfficePoolSummary,
} from '../types/OfficePool';

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
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const isBootstrap =
      typeof original?.url === 'string' && original.url.includes('/auth/telegram/webapp');

    if (status !== 401 || !original || original._retried || isBootstrap) {
      if (status === 401) {
        tokenUtils.removeToken();
        console.error('Authentication failed (no retry available)');
      }
      return Promise.reject(error);
    }

    original._retried = true;

    if (isRefreshing) {
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
      pendingQueue.forEach((callback) => callback(newToken));
      pendingQueue = [];
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      pendingQueue.forEach((callback) => callback(null));
      pendingQueue = [];
      tokenUtils.removeToken();
      console.error('Authentication refresh failed', refreshErr);
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

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
};
