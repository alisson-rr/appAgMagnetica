import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock3,
  DollarSign,
  Plus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import api from '../services/api';
import { Card } from '../components/ui/card';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/PageChrome';

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const todayLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
}).format(new Date());

const appointmentTime = (range) => {
  const match = range?.match(/\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/);
  return match?.[1] || 'Horário a confirmar';
};

const statusLabel = (appointment) => {
  if (appointment.confirmado_em || ['confirmado', 'confirmada'].includes(appointment.status)) {
    return 'Confirmado';
  }
  return 'Aguardando confirmação';
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      setFailed(true);
      toast.error('Não foi possível carregar sua agenda agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <Loading label="Carregando central do dia" className="h-64" />;
  }

  if (failed) {
    return (
      <div className="page-shell">
        <PageHeader title="Central do dia" />
        <Card>
          <ErrorState
            description="A conexão com o servidor falhou. Verifique sua internet e tente de novo."
            onRetry={fetchStats}
          />
        </Card>
      </div>
    );
  }

  const awaiting = stats?.aguardando_confirmacao || 0;
  const appointments = stats?.proximos_agendamentos || [];

  return (
    <div className="page-shell">
      <PageHeader title="Central do dia" description="Sua agenda em um relance — com destaque apenas para o que precisa de você.">
        <Link to="/agenda" className="btn-brand">
          <Plus size={18} /> Novo agendamento
        </Link>
      </PageHeader>

      <p className="-mt-3 text-sm font-semibold uppercase tracking-[.14em] text-primary">{todayLabel}</p>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo de hoje">
        <MetricCard icon={Calendar} label="Atendimentos hoje" value={stats?.total_atendimentos || 0} tone="brand" />
        <MetricCard icon={CheckCircle2} label="Confirmados" value={stats?.confirmados || 0} tone="green" />
        <MetricCard
          icon={AlertCircle}
          label="Aguardando confirmação"
          value={awaiting}
          tone={awaiting > 0 ? 'attention' : 'green'}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-5 md:px-6">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Próximos horários</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">A sequência do seu dia, sem ruído.</p>
            </div>
            <Link to="/agenda" className="shrink-0 text-sm font-semibold text-primary hover:underline">
              Ver agenda
            </Link>
          </div>

          {appointments.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {appointments.map((appointment) => {
                const confirmed = statusLabel(appointment) === 'Confirmado';
                return (
                  <li key={appointment.id} className="flex items-center gap-4 px-5 py-4 md:px-6">
                    <span className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-accent text-primary">
                      <Clock3 size={14} />
                      <strong className="mt-0.5 text-sm">{appointmentTime(appointment.intervalo)}</strong>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {appointment.cliente?.nome || 'Cliente não informado'}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {appointment.procedimento?.nome || 'Serviço'} · {appointment.profissional?.nome || 'Profissional'}
                      </span>
                    </span>
                    <span className={`badge hidden sm:inline-flex ${confirmed ? 'badge-success' : 'badge-attention'}`}>
                      {statusLabel(appointment)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Calendar}
              title="Seu dia está livre por enquanto"
              description="Novos horários e confirmações aparecerão aqui automaticamente."
            >
              <Link to="/agenda" className="btn-brand">
                <Plus size={16} /> Marcar um horário
              </Link>
            </EmptyState>
          )}
        </Card>

        <div className="space-y-5">
          <Card className={awaiting > 0 ? 'border-coral/35 bg-coral-soft/60 p-6' : 'bg-accent/50 p-6'}>
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                awaiting > 0 ? 'bg-coral/25 text-coral-deep' : 'bg-primary/10 text-primary'
              }`}
            >
              {awaiting > 0 ? <AlertCircle size={22} /> : <CheckCircle2 size={22} />}
            </span>
            <h2 className="mt-4 font-display text-lg font-bold text-ink">
              {awaiting > 0
                ? `${awaiting} ${awaiting === 1 ? 'confirmação pendente' : 'confirmações pendentes'}`
                : 'Tudo sob controle'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {awaiting > 0
                ? 'Confira os horários ainda sem resposta para proteger sua agenda de hoje.'
                : 'Nenhum agendamento de hoje precisa da sua atenção agora.'}
            </p>
            <Link to="/agenda" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
              Conferir agenda <ArrowRight size={16} />
            </Link>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <DollarSign size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">Financeiro do mês</p>
                <p className="font-semibold text-ink">Recebido pelos atendimentos</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Recebido</dt>
                <dd className="font-bold text-primary">{money.format(stats?.total_recebido || 0)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <dt className="text-muted-foreground">Pendente</dt>
                <dd className="font-bold text-coral-deep">{money.format(stats?.total_pendente || 0)}</dd>
              </div>
            </dl>
            <p className="field-hint mt-4">Não inclui a assinatura da Agenda Magnética.</p>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-ink">Acessos rápidos</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink to="/agenda" icon={Calendar} label="Abrir agenda" />
          <QuickLink to="/clientes" icon={Users} label="Encontrar cliente" />
          <QuickLink to="/servicos" icon={Clock3} label="Gerenciar serviços" />
        </div>
      </section>
    </div>
  );
};

const toneStyles = {
  brand: { card: 'surface-brand border-transparent', label: 'text-white/70', value: 'text-white', icon: 'bg-white/15 text-white' },
  green: { card: '', label: 'text-muted-foreground', value: 'text-ink', icon: 'bg-accent text-primary' },
  attention: { card: 'border-coral/35', label: 'text-muted-foreground', value: 'text-ink', icon: 'bg-coral/20 text-coral-deep' },
};

const MetricCard = ({ icon: Icon, label, value, tone }) => {
  const style = toneStyles[tone] || toneStyles.green;
  return (
    <Card className={`p-5 ${style.card}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${style.label}`}>{label}</p>
          <p className={`mt-2 font-display text-3xl font-bold ${style.value}`}>{value}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
          <Icon size={22} />
        </span>
      </div>
    </Card>
  );
};

const QuickLink = ({ to, icon: Icon, label }) => (
  <Link
    to={to}
    className="surface-card flex items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-ink transition hover:border-primary/35 hover:text-primary"
  >
    <span className="flex items-center gap-3">
      <Icon size={18} className="text-primary" /> {label}
    </span>
    <ArrowRight size={16} />
  </Link>
);

export default Dashboard;
