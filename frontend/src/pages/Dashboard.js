import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'sonner';
import { 
  Calendar, 
  Users, 
  UserCog, 
  Scissors, 
  TrendingUp,
  Clock,
  DollarSign
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  };

  const atalhos = [
    { to: '/agenda', icon: Calendar, label: 'Nova Marcação', color: '#2C7464' },
    { to: '/clientes', icon: Users, label: 'Clientes', color: '#FEA5A4' },
    { to: '/profissionais', icon: UserCog, label: 'Prestadores', color: '#2C7464' },
    { to: '/servicos', icon: Scissors, label: 'Serviços', color: '#FEA5A4' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
          Dashboard
        </h1>
        <p className="mt-2 text-base" style={{ color: '#292726' }}>
          Visão geral da sua clínica hoje
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card 
          data-testid="total-atendimentos-card"
          className="p-6 rounded-2xl shadow-lg"
          style={{ backgroundColor: 'white', borderColor: '#2C7464', borderWidth: '1px' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#292726' }}>Atendimentos Hoje</p>
              <p className="mt-2 text-3xl font-bold" style={{ color: '#2C7464' }}>
                {stats?.total_atendimentos || 0}
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: '#2C7464' }}>
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
        </Card>

        <Card 
          data-testid="total-recebido-card"
          className="p-6 rounded-2xl shadow-lg"
          style={{ backgroundColor: 'white', borderColor: '#2C7464', borderWidth: '1px' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#292726' }}>Total Recebido (Mês)</p>
              <p className="mt-2 text-3xl font-bold" style={{ color: '#2C7464' }}>
                R$ {(stats?.total_recebido || 0).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: '#FEA5A4' }}>
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </Card>

        <Card 
          data-testid="total-pendente-card"
          className="p-6 rounded-2xl shadow-lg"
          style={{ backgroundColor: 'white', borderColor: '#2C7464', borderWidth: '1px' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#292726' }}>Total Pendente (Mês)</p>
              <p className="mt-2 text-3xl font-bold" style={{ color: '#FEA5A4' }}>
                R$ {(stats?.total_pendente || 0).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: '#FEA5A4' }}>
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Atalhos */}
      <div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
          Atalhos Rápidos
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {atalhos.map((atalho) => {
            const Icon = atalho.icon;
            return (
              <Link
                key={atalho.to}
                to={atalho.to}
                data-testid={`atalho-${atalho.label.toLowerCase().replace(' ', '-')}`}
                className="p-6 rounded-2xl shadow-lg transition-transform hover:scale-105"
                style={{ backgroundColor: 'white' }}
              >
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-4 rounded-full" style={{ backgroundColor: atalho.color }}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm font-medium text-center" style={{ color: '#292726' }}>
                    {atalho.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Próximos Agendamentos */}
      <div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
          Próximos Agendamentos
        </h2>
        <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
          {stats?.proximos_agendamentos && stats.proximos_agendamentos.length > 0 ? (
            <div className="space-y-4">
              {stats.proximos_agendamentos.map((agendamento) => (
                <div
                  key={agendamento.id}
                  data-testid={`agendamento-${agendamento.id}`}
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: '#F7F1EB' }}
                >
                  <div className="flex-1">
                    <p className="font-medium" style={{ color: '#2C7464' }}>
                      {agendamento.cliente?.nome || 'Cliente não informado'}
                    </p>
                    <p className="text-sm" style={{ color: '#292726' }}>
                      {agendamento.procedimento?.nome || 'Procedimento'} - {agendamento.profissional?.nome || 'Profissional'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium" style={{ color: '#2C7464' }}>
                      {/* {agendamento.intervalo && format(parseISO(agendamento.intervalo.split('[')[1].split(',')[0]), 'HH:mm', { locale: ptBR })} */}
                      Verão
                    </p>
                    <span
                      className="inline-block px-3 py-1 text-xs font-medium rounded-full"
                      style={{
                        backgroundColor: agendamento.status === 'confirmado' ? '#2C7464' : '#FEA5A4',
                        color: 'white'
                      }}
                    >
                      {agendamento.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8" style={{ color: '#292726' }}>
              Nenhum agendamento próximo
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;