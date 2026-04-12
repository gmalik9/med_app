import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppPage } from './pages/AppPage';

function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppPage /> : <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
