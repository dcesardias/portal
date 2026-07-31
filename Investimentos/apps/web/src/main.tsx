import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import './index.css';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { SolicitacoesListPage } from './pages/SolicitacoesListPage';
import { NovaSolicitacaoPage } from './pages/NovaSolicitacaoPage';
import { SolicitacaoDetailPage } from './pages/SolicitacaoDetailPage';
import { AprovacoesPage } from './pages/AprovacoesPage';
import { AdminPage } from './pages/admin/AdminPage';
import { SuprimentosPage } from './pages/SuprimentosPage';
import { ContabilidadePage } from './pages/ContabilidadePage';
import { ContabilidadeRoute } from './components/ContabilidadeRoute';
import { AprovadorRelatorioPage } from './pages/AprovadorRelatorioPage';
import { MesaAprovacaoFinalPage } from './pages/MesaAprovacaoFinalPage';
import { AprovadorFinalRoute } from './components/AprovadorFinalRoute';
import { AdminRoute } from './components/AdminRoute';
import { ApproverRoute } from './components/ApproverRoute';
import { RelatorioRoute } from './components/RelatorioRoute';
import { SuprimentosRoute } from './components/SuprimentosRoute';
import { AdminRelatorioPanel } from './pages/admin/AdminRelatorioPanel';
import { TourProvider } from './components/TourContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/aacdinveste">
        <TourProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/solicitacoes" element={<SolicitacoesListPage />} />
            <Route path="/solicitacoes/nova" element={<NovaSolicitacaoPage />} />
            {/* Edição: acessível ao dono (rascunho/revisão) e ao admin. A
                autorização real é feita no backend (403 se não puder). */}
            <Route path="/solicitacoes/:id/editar" element={<NovaSolicitacaoPage />} />
            <Route path="/solicitacoes/:id" element={<SolicitacaoDetailPage />} />
            <Route
              path="/aprovacoes"
              element={
                <ApproverRoute>
                  <AprovacoesPage />
                </ApproverRoute>
              }
            />
            <Route
              path="/meu-relatorio"
              element={
                <ApproverRoute>
                  <AprovadorRelatorioPage />
                </ApproverRoute>
              }
            />
            <Route
              path="/contabilidade"
              element={
                <ContabilidadeRoute>
                  <ContabilidadePage />
                </ContabilidadeRoute>
              }
            />
            <Route
              path="/mesa-final"
              element={
                <AprovadorFinalRoute>
                  <MesaAprovacaoFinalPage />
                </AprovadorFinalRoute>
              }
            />
            <Route
              path="/relatorio"
              element={
                <RelatorioRoute>
                  <AdminRelatorioPanel />
                </RelatorioRoute>
              }
            />
            <Route
              path="/suprimentos"
              element={
                <SuprimentosRoute>
                  <SuprimentosPage />
                </SuprimentosRoute>
              }
            />
            <Route path="/admin/fluxos" element={<Navigate to="/admin" replace />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </TourProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
