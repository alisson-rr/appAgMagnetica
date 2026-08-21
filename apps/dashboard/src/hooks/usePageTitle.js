import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/clientes': 'Clientes',
  '/profissionais': 'Profissionais',
  '/servicos': 'Procedimento',
  '/pagamentos': 'Pagamentos',
  '/comissoes': 'Comissões',
  '/configuracoes': 'Configurações',
  '/login': 'Login',
  '/cadastro': 'Cadastro',
  '/planos': 'Escolha seu Plano'
};

const usePageTitle = (customTitle) => {
  const location = useLocation();

  useEffect(() => {
    const pageTitle = customTitle || pageTitles[location.pathname] || 'Início';
    document.title = `Agenda Magnética | ${pageTitle}`;
  }, [location.pathname, customTitle]);
};

export default usePageTitle;
