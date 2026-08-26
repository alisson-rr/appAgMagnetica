import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import { Loading } from './components/PageChrome';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Agenda = lazy(() => import('./pages/AgendaNew'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Profissionais = lazy(() => import('./pages/Profissionais'));
const Servicos = lazy(() => import('./pages/Servicos'));
const Pagamentos = lazy(() => import('./pages/Pagamentos'));
const Comissoes = lazy(() => import('./pages/Comissoes'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Cadastro = lazy(() => import('./pages/Cadastro'));
const EscolherPlano = lazy(() => import('./pages/EscolherPlano'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loading label="Carregando a Agenda Magnética" className="" />
  </div>
);

const PrivateRoute = ({ children, skipOnboardingCheck = false, skipTrialCheck = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Se trial expirou e não tem assinatura ativa, redireciona para planos
  if (!skipTrialCheck && user.trial_expirado && user.status_assinatura !== 'ativo') {
    return <Navigate to="/planos" />;
  }

  // Se não tem id_info_clinica, precisa fazer onboarding
  if (!skipOnboardingCheck && !user.id_info_clinica) {
    return <Navigate to="/onboarding" />;
  }

  return children;
};

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/cadastro" element={user ? <Navigate to="/dashboard" /> : <Cadastro />} />
          {/*
            `/planos` fica aberta durante o trial (contrato §4.2). Mandar quem
            está em teste de volta para o painel transformava o link "Ver
            planos" do Layout em um ida-e-volta; mandar quem expirou para
            `/login` trancava a conta do lado de fora.
          */}
          <Route path="/planos" element={<EscolherPlano />} />
          <Route
            path="/onboarding"
            element={
              <PrivateRoute skipOnboardingCheck={true}>
                <Onboarding />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
          <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
          <Route path="/agenda" element={<PrivateRoute><Layout><Agenda /></Layout></PrivateRoute>} />
          <Route path="/clientes" element={<PrivateRoute><Layout><Clientes /></Layout></PrivateRoute>} />
          <Route path="/profissionais" element={<PrivateRoute><Layout><Profissionais /></Layout></PrivateRoute>} />
          <Route path="/servicos" element={<PrivateRoute><Layout><Servicos /></Layout></PrivateRoute>} />
          <Route path="/pagamentos" element={<PrivateRoute><Layout><Pagamentos /></Layout></PrivateRoute>} />
          <Route path="/comissoes" element={<PrivateRoute><Layout><Comissoes /></Layout></PrivateRoute>} />
          <Route path="/configuracoes" element={<PrivateRoute><Layout><Configuracoes /></Layout></PrivateRoute>} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" richColors theme="light" />
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
