import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenUtils } from '../utils/token';
import { bootstrapAuth } from './auth-bootstrap';
import { Prediction, QuoteRequest, QuoteResponse } from '../types/Prediction';
import { PredictionRecord, CreatePredictionRecordRequest, CreatePredictionResult } from '../types/PredictionRecord';
import { User } from '../types/User';

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

    // Only refresh-and-retry on 401, and only once per request. The bootstrap
    // endpoint itself must never recurse here.
    const isBootstrap = typeof original?.url === 'string' && original.url.includes('/auth/telegram/webapp');
    if (status !== 401 || !original || original._retried || isBootstrap) {
      if (status === 401) {
        tokenUtils.removeToken();
        console.error('Authentication failed (no retry available)');
      }
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

  // M4.2 — chain-true post-slippage quote. LMSR routes through hub.previewPredict;
  // NAIVE is BE-synthesized using the same post-bet pool-ratio formula the FE
  // used to compute locally. Replaces `calculateWin` in PredictionModal.
  getQuote: async (predictionId: string, body: QuoteRequest): Promise<QuoteResponse> => {
    const response = await api.post<QuoteResponse>(`/predictions/${predictionId}/quote`, body);
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
