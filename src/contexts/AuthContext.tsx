/**
 * AuthContext
 * Provides authentication state throughout the app.
 *
 * - On mount: fetches /api/auth/me to check for an existing session
 * - Detects ?login=success URL param after OAuth callback and refetches
 * - Exposes: user, isAuthenticated, isLoading, login(), logout()
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { AuthAPI } from '../api/api';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchUser = useCallback(async () => {
    try {
      const { user: fetchedUser } = await AuthAPI.getMe();
      setUser(fetchedUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial session check
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Detect ?login=success after OAuth callback redirect
  useEffect(() => {
    if (searchParams.get('login') === 'success') {
      // Remove the query param from the URL
      searchParams.delete('login');
      setSearchParams(searchParams, { replace: true });
      // Refetch user data
      setIsLoading(true);
      fetchUser();
    }
  }, [searchParams, setSearchParams, fetchUser]);

  const login = useCallback(() => {
    // Full page redirect to the OAuth login endpoint
    window.location.href = AuthAPI.getLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    try {
      await AuthAPI.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
