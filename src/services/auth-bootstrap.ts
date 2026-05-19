/**
 * M7.4.6 — Telegram Mini-App auth bootstrap.
 *
 * Replaces the legacy `?auth_token=<jwt>` URL-borne JWT (URL-leak risk: any
 * forwarded message gave full impersonation for 7 days). New flow:
 *
 *   1. Read `window.Telegram.WebApp.initData` (HMAC-signed by Telegram).
 *   2. POST it to BE `/auth/telegram/webapp`.
 *   3. BE verifies via `verifyInitData` (M7.4.5 helper) and returns a
 *      short-lived JWT (1h).
 *   4. Store JWT in localStorage; axios interceptor attaches it as usual.
 *
 * Stolen-JWT exposure window shrinks from 7 days to 1 hour, and any
 * leaked URL contains no credential at all.
 */

import axios from 'axios';
import { tokenUtils } from '../utils/token';

interface WebappAuthResponse {
  token: string;
  expiresAt: number;
}

/**
 * Resolves with the freshly-issued JWT (also written to localStorage).
 * Rejects when initData is missing, forged, stale, or when no DePick user
 * exists for the Telegram id (user has not run /start).
 */
export async function bootstrapAuth(): Promise<string> {
  const tg = (window as any).Telegram?.WebApp;
  const initData = (tg?.initData as string | undefined) ?? '';
  if (!initData) {
    throw new Error('Missing Telegram WebApp initData — open this Mini App from Telegram');
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
