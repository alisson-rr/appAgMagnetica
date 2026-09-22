import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext();

/**
 * O objeto do `localStorage` é só cache de primeira pintura: ele não expira
 * sozinho e o próprio usuário pode editá-lo. Quem decide trial e onboarding é
 * `GET /auth/me` (contrato §3.1/§4.1).
 */
const usuarioEmCache = () => {
  try {
    const bruto = localStorage.getItem('user');
    if (!bruto) return null;
    const salvo = JSON.parse(bruto);
    return salvo && typeof salvo === 'object' ? salvo : null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

const guardar = (usuario) => {
  localStorage.setItem('user', JSON.stringify(usuario));
  return usuario;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => (localStorage.getItem('token') ? usuarioEmCache() : null));
  const [loading, setLoading] = useState(true);

  /**
   * Recarrega a sessão a partir do servidor. Devolve o usuário ou `null`.
   * `401` é tratado pelo interceptor do axios (limpa e vai para /login); outra
   * falha (API fora do ar) mantém o cache, senão uma queda de rede desloga
   * todo mundo no meio do onboarding.
   */
  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setUser(null);
      return null;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(guardar(data));
      return data;
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        return null;
      }
      return usuarioEmCache();
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
    const id = setInterval(refreshUser, 60000);
    window.addEventListener('focus', refreshUser);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refreshUser);
    };
  }, [refreshUser]);

  const login = async (email, senha) => {
    try {
      const response = await api.post('/auth/login', { email, senha });
      const { access_token, usuario } = response.data;

      localStorage.setItem('token', access_token);
      // Pinta com o que o login devolveu e confirma com o servidor em seguida.
      setUser(guardar(usuario));
      await refreshUser();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Erro ao fazer login',
      };
    }
  };

  const register = async (email, senha, nome) => {
    try {
      await api.post('/auth/register', { email, senha, nome });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Erro ao registrar',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  const updateUser = (newUserData, accessToken) => {
    if (accessToken) {
      localStorage.setItem('token', accessToken);
    }
    setUser((atual) => guardar({ ...(atual || {}), ...newUserData }));
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
