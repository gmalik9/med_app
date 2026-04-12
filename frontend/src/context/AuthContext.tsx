import React, { createContext, useState, ReactNode, useEffect, useContext } from 'react';
import { apiClient } from '../utils/apiClient';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  refreshToken: (token: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.login(email, password);
      const { user: userData, accessToken, refreshToken: rt } = response.data;
      
      apiClient.setAccessToken(accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('refreshToken', rt);
      
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error: any) {
      console.error('[AuthContext] Login error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config,
      });
      throw error;
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName: string) => {
    try {
      const response = await apiClient.register(email, password, firstName, lastName);
      const { user: userData, accessToken, refreshToken: rt } = response.data;
      
      apiClient.setAccessToken(accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('refreshToken', rt);
      
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error: any) {
      console.error('[AuthContext] Register error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config,
      });
      throw error;
    }
  };

  const logout = () => {
    apiClient.clearToken();
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');
    
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshToken = async (token: string) => {
    const response = await apiClient.refreshToken(token);
    apiClient.setAccessToken(response.data.accessToken);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, register, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
