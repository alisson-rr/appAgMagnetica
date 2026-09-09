import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import {
  Calendar,
  LayoutDashboard,
  MessageSquare,
  Users,
  UserCog,
  Scissors,
  DollarSign,
  Settings,
  LogOut,
  MoreHorizontal,
  Sparkles,
  X
} from 'lucide-react';

// `testId` é fixo para não depender do rótulo visível.
const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Central do Dia', testId: 'menu-central do dia', primary: true },
  { path: '/agenda', icon: Calendar, label: 'Agenda', testId: 'menu-agenda', primary: true },
  { path: '/conversas', icon: MessageSquare, label: 'Conversas', testId: 'menu-conversas', primary: true },
  { path: '/clientes', icon: Users, label: 'Clientes', testId: 'menu-clientes', primary: true },
  { path: '/profissionais', icon: UserCog, label: 'Profissionais', testId: 'menu-profissionais' },
  { path: '/servicos', icon: Scissors, label: 'Serviços', testId: 'menu-serviços' },
  // "Financeiro" = dinheiro recebido pelos atendimentos. A assinatura da
  // Agenda Magnética é outro assunto e vive na faixa de plano, acima.
  { path: '/pagamentos', icon: DollarSign, label: 'Financeiro', testId: 'menu-pagamentos', primary: true },
  { path: '/configuracoes', icon: Settings, label: 'Configurações', testId: 'menu-configurações' },
];

const primaryItems = menuItems.filter((item) => item.primary);

const NavItem = ({ item, active, onNavigate }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      data-testid={item.testId}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
        active ? 'bg-white text-green-deep shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-coral" />}
      <Icon className="h-5 w-5 shrink-0" />
      {item.label}
    </Link>
  );
};

const UserBlock = ({ user, logout }) => (
  <div className="flex items-center gap-3 border-t border-white/10 p-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 font-display text-sm font-bold text-white">
      {(user?.nome || '?').trim().charAt(0).toUpperCase()}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-white">{user?.nome}</p>
      <p className="truncate text-xs text-white/65">{user?.email}</p>
    </div>
    <button
      type="button"
      data-testid="logout-button"
      onClick={logout}
      aria-label="Sair da conta"
      title="Sair da conta"
      className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
    >
      <LogOut className="h-5 w-5" />
    </button>
  </div>
);

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  usePageTitle();

  const isActive = (path) => location.pathname === path;
  const emTeste = user?.status_assinatura === 'trial';

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside
        className="fixed inset-y-0 hidden w-64 flex-col md:flex"
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <div className="flex h-20 items-center justify-center px-4">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="h-12" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
          {menuItems.map((item) => (
            <NavItem key={item.path} item={item} active={isActive(item.path)} />
          ))}
        </nav>
        <UserBlock user={user} logout={logout} />
      </aside>

      {/* Barra superior — mobile */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl md:hidden">
        <img src="/assets/logo.png" alt="Agenda Magnética" className="h-9" />
        <button
          type="button"
          onClick={logout}
          aria-label="Sair da conta"
          className="icon-action"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {/* Gaveta com o menu completo — mobile */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-green-dark/50 backdrop-blur-sm md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="menu-completo"
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl pb-[env(safe-area-inset-bottom)] transition-transform duration-300 md:hidden ${
          menuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ background: 'var(--gradient-sidebar)' }}
        /* `inert` (nativo) tira o menu fechado do foco e da leitura de tela. */
        {...(menuOpen ? {} : { inert: '' })}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <p className="font-display text-base font-bold text-white">Todas as áreas</p>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
            className="rounded-xl p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="grid gap-1 px-3 pb-4" aria-label="Todas as áreas">
          {menuItems.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              active={isActive(item.path)}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
        <UserBlock user={user} logout={logout} />
      </aside>

      {/* Navegação inferior — mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Navegação rápida"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span className={`rounded-full px-4 py-1 transition ${active ? 'bg-accent' : ''}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="max-w-full truncate px-1">{item.label === 'Central do Dia' ? 'Início' : item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="menu-completo"
          className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
            menuOpen ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <span className={`rounded-full px-4 py-1 transition ${menuOpen ? 'bg-accent' : ''}`}>
            <MoreHorizontal className="h-5 w-5" />
          </span>
          Mais
        </button>
      </nav>

      <main className="pb-24 pt-16 md:pb-0 md:pl-64 md:pt-0">
        {emTeste && (
          <div className="border-b border-border/70 bg-accent/70">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:px-8">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold text-green-deep">
                {user?.dias_restantes > 0
                  ? `Teste grátis · ${user.dias_restantes} ${user.dias_restantes === 1 ? 'dia restante' : 'dias restantes'}`
                  : 'Você está no período de teste grátis'}
              </span>
              <Link to="/planos" className="font-semibold text-primary underline underline-offset-4">
                Ver planos
              </Link>
            </div>
          </div>
        )}
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
