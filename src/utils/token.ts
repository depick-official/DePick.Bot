import { jwtDecode } from 'jwt-decode';
import { LoginProvider } from '../types/User';

interface DecodedToken {
  exp: number;
  loginProvider?: LoginProvider;
  [key: string]: any;
}

interface TokenData {
  token: string | null;
  loginProvider: LoginProvider | null;
}

export const tokenUtils = {
  // Set the authentication token and optionally the auth provider
  setToken: (token: string, loginProvider?: LoginProvider) => {
    localStorage.setItem('token', token);
    
    // Store the auth provider separately if provided
    if (loginProvider) {
      localStorage.setItem('loginProvider', loginProvider);
    }
  },
  
  // Get just the token string
  getToken: () => {
    return localStorage.getItem('token');
  },
  
  // Get both the token and auth provider
  getTokenData: (): TokenData => {
    const token = localStorage.getItem('token');
    const loginProvider = localStorage.getItem('loginProvider') as LoginProvider | null;
    
    return { token, loginProvider };
  },
  
  // Remove all token-related data
  removeToken: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('loginProvider');
  },
  
  // Check if the token is valid
  isTokenValid: () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      return decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },
  
  // Get the auth provider from the token if available
  getLoginProviderFromToken: (): LoginProvider | null => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      return decoded.loginProvider || null;
    } catch {
      return null;
    }
  }
}; 