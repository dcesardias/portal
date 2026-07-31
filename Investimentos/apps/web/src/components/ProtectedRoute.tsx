import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isAuthenticated } from '../lib/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    // Sem token: mostra a tela de login da SPA (entrada via conta Microsoft).
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
