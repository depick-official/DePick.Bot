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
import { LoginProvider } from '../types/User';
import { tokenUtils } from '../utils/token';

interface WebappAuthResponse {
  token: string;
  expiresAt: number;
}

export type MiniAppAuthProvider = Extract<
  LoginProvider,
  'TELEGRAM' | 'MESSENGER' | 'DISCORD'
>;

let bootstrapPromise: Promise<string> | null = null;

function cleanupLaunchParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('exchange');
  url.searchParams.delete('auth_token');
  url.searchParams.delete('auth_success');
  url.searchParams.delete('provider');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, next);
}

export function detectBootstrapProvider(): MiniAppAuthProvider | null {
  const tg = (window as any).Telegram?.WebApp;
  if ((tg?.initData as string | undefined) ?? '') {
    return 'TELEGRAM';
  }

  const params = new URLSearchParams(window.location.search);
  const urlProvider = params.get('provider')?.toUpperCase();
  if (urlProvider === 'MESSENGER') {
    return 'MESSENGER';
  }
  if (urlProvider === 'DISCORD') {
    return 'DISCORD';
  }

  const { loginProvider } = tokenUtils.getTokenData();
  if (loginProvider === 'MESSENGER') return 'MESSENGER';
  if (loginProvider === 'DISCORD') return 'DISCORD';
  return null;
}

/**
 * Resolves with the freshly-issued JWT (also written to localStorage).
 * Rejects when initData is missing, forged, stale, or when no DePick user
 * exists for the Telegram id (user has not run /start).
 */
async function bootstrapAuthOnce(): Promise<string> {
  const baseURL = import.meta.env.VITE_API_URL || '';
  const tg = (window as any).Telegram?.WebApp;
  const initData = (tg?.initData as string | undefined) ?? '';
  if (initData) {
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

  const params = new URLSearchParams(window.location.search);
  const provider = params.get('provider')?.toUpperCase();
  const exchangeToken = params.get('exchange');

  if (provider === 'MESSENGER' && exchangeToken) {
    const response = await axios.post<WebappAuthResponse>(
      `${baseURL}/messenger/exchange`,
      { exchangeToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        timeout: 15000,
      },
    );

    tokenUtils.setToken(response.data.token, 'MESSENGER');
    cleanupLaunchParams();
    return response.data.token;
  }

  if (provider === 'DISCORD' && exchangeToken) {
    const response = await axios.post<WebappAuthResponse>(
      `${baseURL}/auth/discord/exchange`,
      { exchangeToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        timeout: 15000,
      },
    );

    tokenUtils.setToken(response.data.token, 'DISCORD');
    cleanupLaunchParams();
    return response.data.token;
  }

  const { token, loginProvider } = tokenUtils.getTokenData();
  if (
    (loginProvider === 'MESSENGER' || loginProvider === 'DISCORD') &&
    token &&
    tokenUtils.isTokenValid()
  ) {
    return token;
  }

  throw new Error(
    'Missing Discord/Messenger exchange token or Telegram WebApp initData',
  );
}

export function bootstrapAuth(): Promise<string> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = bootstrapAuthOnce().finally(() => {
    bootstrapPromise = null;
  });
  return bootstrapPromise;
}
