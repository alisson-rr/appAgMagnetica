import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setStats(response.data);
      } catch (error) {
        toast.error('Não foi possível carregar sua agenda agora.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Carregando central do dia">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#DCE9E5] border-b-[#2C7464]" />
      </div>
    );
  }

  const awaiting = stats?.aguardando_confirmacao || 0;
  const appointments = stats?.proximos_agendamentos || [];

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2C7464]">
            {todayLabel}
          </span>
          <h1 className="mt-2 text-3xl font-bold text-[#183D35] md:text-4xl">Central do dia</h1>
          <p className="mt-2 max-w-2xl text-[#5F6865]">
            Sua agenda em um relance — com destaque apenas para o que precisa de você.
          </p>
        </div>
        <Link
          to="/agenda"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2C7464] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#235D51]"
        >
          <Plus size={18} /> Novo agendamento
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo de hoje">
        <MetricCard
          icon={Calendar}
          label="Atendimentos hoje"
          value={stats?.total_atendimentos || 0}
          tone="green"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Confirmados"
          value={stats?.confirmados || 0}
          tone="green"
        />
        <MetricCard
          icon={AlertCircle}
          label="Aguardando confirmação"
          value={awaiting}
          tone={awaiting > 0 ? 'coral' : 'green'}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <Card className="overflow-hidden rounded-3xl border border-[#DFE8E4] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EDF1EF] px-5 py-5 md:px-7">
            <div>
              <h2 className="text-xl font-bold text-[#183D35]">Próximos horários</h2>
              <p className="mt-1 text-sm text-[#6A7471]">A sequência do seu dia, sem ruído.</p>
            </div>
            <Link to="/agenda" className="text-sm font-semibold text-[#2C7464] hover:text-[#183D35]">
              Ver agenda
            </Link>
          </div>

          {appointments.length > 0 ? (
            <div className="divide-y divide-[#EDF1EF]">
              {appointments.map((appointment) => {
                const confirmed = statusLabel(appointment) === 'Confirmado';
                return (
                  <div key={appointment.id} className="flex gap-4 px-5 py-5 md:items-center md:px-7">
                    <div className="flex h-12 min-w-16 flex-col items-center justify-center rounded-xl bg-[#F1F7F5] text-[#2C7464]">
                      <Clock3 size={15} />
                      <strong className="mt-0.5 text-sm">{appointmentTime(appointment.intervalo)}</strong>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#26322F]">
                        {appointment.cliente?.nome || 'Cliente não informado'}
                      </p>
                      <p className="mt-1 truncate text-sm text-[#6A7471]">
                        {appointment.procedimento?.nome || 'Serviço'} · {appointment.profissional?.nome || 'Profissional'}
                      </p>
                    </div>
                    <span className={`hidden rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${
                      confirmed ? 'bg-[#E7F3EF] text-[#236150]' : 'bg-[#FFF0ED] text-[#A34D45]'
                    }`}>
                      {statusLabel(appointment)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1F7F5] text-[#2C7464]">
                <Calendar size={26} />
              </div>
              <h3 className="mt-4 font-bold text-[#26322F]">Seu dia está livre por enquanto</h3>
              <p className="mt-2 max-w-sm text-sm text-[#6A7471]">
                Novos horários e confirmações aparecerão aqui automaticamente.
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className={`rounded-3xl border p-6 shadow-sm ${
            awaiting > 0 ? 'border-[#F5C8C1] bg-[#FFF8F6]' : 'border-[#CFE3DC] bg-[#F5FAF8]'
          }`}>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              awaiting > 0 ? 'bg-[#FFE3DE] text-[#A34D45]' : 'bg-[#DCEDE7] text-[#2C7464]'
            }`}>
              {awaiting > 0 ? <AlertCircle size={23} /> : <CheckCircle2 size={23} />}
            </div>
            <h2 className="mt-5 text-xl font-bold text-[#183D35]">
              {awaiting > 0
                ? `${awaiting} ${awaiting === 1 ? 'confirmação pendente' : 'confirmações pendentes'}`
                : 'Tudo sob controle'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5F6865]">
              {awaiting > 0
                ? 'Confira os horários ainda sem resposta para proteger sua agenda de hoje.'
                : 'Nenhum agendamento de hoje precisa da sua atenção agora.'}
            </p>
            <Link to="/agenda" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2C7464]">
              Conferir agenda <ArrowRight size={16} />
            </Link>
          </Card>

          <Card className="rounded-3xl border border-[#DFE8E4] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F7F5] text-[#2C7464]">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71807B]">Resumo do mês</p>
                <p className="font-bold text-[#26322F]">Movimento financeiro</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[#6A7471]">Recebido</dt>
                <dd className="font-bold text-[#2C7464]">{money.format(stats?.total_recebido || 0)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-[#EDF1EF] pt-3">
                <dt className="text-[#6A7471]">Pendente</dt>
                <dd className="font-bold text-[#A34D45]">{money.format(stats?.total_pendente || 0)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-[#183D35]">Acessos rápidos</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink to="/agenda" icon={Calendar} label="Abrir agenda" />
          <QuickLink to="/clientes" icon={Users} label="Encontrar cliente" />
          <QuickLink to="/servicos" icon={Clock3} label="Gerenciar serviços" />
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value, tone }) => (
  <Card className="rounded-2xl border border-[#DFE8E4] bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[#69736F]">{label}</p>
        <p className="mt-2 text-3xl font-bold text-[#183D35]">{value}</p>
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
        tone === 'coral' ? 'bg-[#FFE3DE] text-[#A34D45]' : 'bg-[#DCEDE7] text-[#2C7464]'
      }`}>
        <Icon size={23} />
      </div>
    </div>
  </Card>
);

const QuickLink = ({ to, icon: Icon, label }) => (
  <Link
    to={to}
    className="flex items-center justify-between rounded-2xl border border-[#DFE8E4] bg-white px-5 py-4 text-sm font-semibold text-[#26322F] shadow-sm hover:border-[#AFCFC4] hover:text-[#2C7464]"
  >
    <span className="flex items-center gap-3">
      <Icon size={19} className="text-[#2C7464]" /> {label}
    </span>
    <ArrowRight size={16} />
  </Link>
);

export default Dashboard;
