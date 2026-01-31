import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/AgendaNew';
import Clientes from './pages/Clientes';
import Profissionais from './pages/Profissionais';
import Servicos from './pages/Servicos';
import Pagamentos from './pages/Pagamentos';
import Comissoes from './pages/Comissoes';
import Configuracoes from './pages/Configuracoes';
import Cadastro from './pages/Cadastro';
import EscolherPlano from './pages/EscolherPlano';
import Onboarding from './pages/Onboarding';
import './App.css';

const PrivateRoute = ({ children, skipOnboardingCheck = false }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/cadastro" element={user ? <Navigate to="/dashboard" /> : <Cadastro />} />
        <Route path="/planos" element={user ? <Navigate to="/dashboard" /> : <EscolherPlano />} />
        <Route path="/onboarding" element={<PrivateRoute skipOnboardingCheck={true}><Onboarding /></PrivateRoute>} />
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
      <Toaster position="top-right" richColors />
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