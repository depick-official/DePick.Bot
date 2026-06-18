import axios from 'axios';
import { tokenUtils } from '../utils/token';

interface WebappAuthResponse {
  token: string;
  expiresAt: number;
}

export async function bootstrapAuth(): Promise<string> {
  const telegramWebApp = (window as any).Telegram?.WebApp;
  const initData = (telegramWebApp?.initData as string | undefined) ?? '';
  if (!initData) {
    const existingToken = tokenUtils.getToken();
    if (existingToken && tokenUtils.isTokenValid()) {
      return existingToken;
    }
    throw new Error('Missing Telegram WebApp initData - open this Mini App from Telegram');
  }

  const baseURL = import.meta.env.VITE_API_URL || '';
  const response = await axios.post<WebappAuthResponse>(
    `${baseURL}/auth/telegram/webapp`,
    { initData },
    {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      timeout: 15000,
    },
  );

  tokenUtils.setToken(response.data.token, 'TELEGRAM');
  return response.data.token;
}
