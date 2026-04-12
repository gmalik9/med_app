import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from '../pages/LoginPage';
import { AppPage } from '../pages/AppPage';

export default function Router() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <AppPage /> : <LoginPage />;
}

