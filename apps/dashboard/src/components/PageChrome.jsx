import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Cabeçalho, carregamento, vazio e erro compartilhados por todas as telas do painel.
 * Alterar aqui muda a hierarquia visual do app inteiro.
 */

export const PageHeader = ({ title, description, children }) => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-subtitle">{description}</p>}
    </div>
    {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
  </header>
);

export const Loading = ({ label = 'Carregando', className = 'py-16' }) => (
  <div className={`flex items-center justify-center ${className}`} role="status" aria-label={label}>
    <span className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-b-primary" />
    <span className="sr-only">{label}…</span>
  </div>
);

export const EmptyState = ({ icon: Icon, title, description, children }) => (
  <div className="flex flex-col items-center px-6 py-16 text-center">
    {Icon && (
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon size={26} />
      </span>
    )}
    <h2 className="mt-4 font-display text-lg font-bold text-ink">{title}</h2>
    {description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {children && <div className="mt-6">{children}</div>}
  </div>
);

export const ErrorState = ({ title = 'Não foi possível carregar', description, onRetry }) => (
  <div className="flex flex-col items-center px-6 py-16 text-center" role="alert">
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
      <AlertTriangle size={26} />
    </span>
    <h2 className="mt-4 font-display text-lg font-bold text-ink">{title}</h2>
    {description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn-brand mt-6">
        <RotateCw size={16} /> Tentar novamente
      </button>
    )}
  </div>
);
