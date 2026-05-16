import axios, { AxiosInstance } from 'axios';
import { tokenUtils } from '../utils/token';
import { Prediction, QuoteRequest, QuoteResponse } from '../types/Prediction';
import { PredictionRecord, CreatePredictionRecordRequest } from '../types/PredictionRecord';
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
