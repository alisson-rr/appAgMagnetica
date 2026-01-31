import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Building2, MessageSquare, Clock, History, Save, QrCode, Plus, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const HORAS = Array.from({ length: 24 }, (_, i) => {
  const hora = String(i).padStart(2, '0');
  return { value: `${hora}:00`, label: `${hora}:00` };
}).concat(
  Array.from({ length: 24 }, (_, i) => {
    const hora = String(i).padStart(2, '0');
    return { value: `${hora}:30`, label: `${hora}:30` };
  })
).sort((a, b) => a.value.localeCompare(b.value));

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const Configuracoes = () => {
  const [activeTab, setActiveTab] = useState('dados');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dados da clínica
  const [clinicaData, setClinicaData] = useState({
    id: null,
    nome: '',
    telefone: '',
    email: '',
    descricao: '',
    endereco: ''
  });
  
  // Horários de atendimento - agrupados por dia com múltiplos turnos
  const [horarios, setHorarios] = useState([]);
  const [horariosOriginais, setHorariosOriginais] = useState([]);
  
  // Mensagem modelo
  const [mensagemLembrete, setMensagemLembrete] = useState(
    'Olá {nome}! Lembramos que você tem uma consulta agendada para {data} às {horario}. Confirme sua presença respondendo esta mensagem.'
  );
  
  // Histórico de assinaturas
  const [assinaturas, setAssinaturas] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [clinicaRes, horariosRes] = await Promise.all([
        api.get('/config/info-clinica'),
        api.get('/config/horarios-clinica')
      ]);
      
      if (clinicaRes.data) {
        setClinicaData(clinicaRes.data);
      }
      
      // Agrupar horários por dia da semana (suportando múltiplos turnos)
      const horariosExistentes = horariosRes.data || [];
      setHorariosOriginais(horariosExistentes);
      
      const horariosAgrupados = DIAS_SEMANA.map(dia => {
        const turnosDoDia = horariosExistentes
          .filter(h => h.dia_semana === dia.value)
          .map(h => ({
            id: h.id,
            hora_inicio: h.hora_inicio?.substring(0, 5) || '',
            hora_fim: h.hora_fim?.substring(0, 5) || ''
          }));
        
        return {
          dia_semana: dia.value,
          turnos: turnosDoDia.length > 0 ? turnosDoDia : [{ hora_inicio: '', hora_fim: '' }]
        };
      });
      setHorarios(horariosAgrupados);
      
      // TODO: Buscar histórico de assinaturas quando endpoint estiver disponível
      // const assinaturasRes = await api.get('/assinaturas/historico');
      // setAssinaturas(assinaturasRes.data || []);
      
    } catch (error) {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClinica = async () => {
    try {
      setSaving(true);
      if (clinicaData.id) {
        await api.put(`/config/info-clinica/${clinicaData.id}`, clinicaData);
      }
      toast.success('Dados da clínica salvos com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar dados da clínica');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHorarios = async () => {
    try {
      setSaving(true);
      
      // Deletar horários antigos que foram removidos
      for (const original of horariosOriginais) {
        const diaAtual = horarios.find(h => h.dia_semana === original.dia_semana);
        const turnoExiste = diaAtual?.turnos.some(t => t.id === original.id);
        if (!turnoExiste) {
          await api.delete(`/config/horarios-clinica/${original.id}`);
        }
      }
      
      // Salvar/atualizar horários
      for (const horario of horarios) {
        for (const turno of horario.turnos) {
          if (turno.hora_inicio && turno.hora_fim) {
            if (turno.id) {
              // Atualizar existente
              await api.put(`/config/horarios-clinica/${turno.id}`, {
                dia_semana: horario.dia_semana,
                hora_inicio: turno.hora_inicio,
                hora_fim: turno.hora_fim
              });
            } else {
              // Criar novo
              await api.post('/config/horarios-clinica', {
                dia_semana: horario.dia_semana,
                hora_inicio: turno.hora_inicio,
                hora_fim: turno.hora_fim
              });
            }
          }
        }
      }
      
      toast.success('Horários salvos com sucesso!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar horários');
    } finally {
      setSaving(false);
    }
  };

  const addTurno = (diaSemana) => {
    setHorarios(prev => prev.map(h => 
      h.dia_semana === diaSemana 
        ? { ...h, turnos: [...h.turnos, { hora_inicio: '', hora_fim: '' }] }
        : h
    ));
  };

  const removeTurno = (diaSemana, turnoIndex) => {
    setHorarios(prev => prev.map(h => 
      h.dia_semana === diaSemana 
        ? { ...h, turnos: h.turnos.filter((_, i) => i !== turnoIndex) }
        : h
    ));
  };

  const updateTurno = (diaSemana, turnoIndex, field, value) => {
    setHorarios(prev => prev.map(h => 
      h.dia_semana === diaSemana 
        ? { 
            ...h, 
            turnos: h.turnos.map((t, i) => 
              i === turnoIndex ? { ...t, [field]: value } : t
            )
          }
        : h
    ));
  };

  const tabs = [
    { id: 'dados', label: 'Dados da Clínica', icon: Building2 },
    { id: 'automacao', label: 'Automação', icon: MessageSquare },
    { id: 'horarios', label: 'Horário de Atendimento', icon: Clock },
    { id: 'historico', label: 'Histórico', icon: History },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
          Configurações da Conta
        </h1>
        <p className="mt-2 text-base" style={{ color: '#292726' }}>
          Personalize a plataforma para a sua clínica.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: '#E5E0DA' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-current'
                  : 'border-transparent hover:border-gray-300'
              }`}
              style={{ 
                color: activeTab === tab.id ? '#2C7464' : '#6B7280',
                borderColor: activeTab === tab.id ? '#2C7464' : 'transparent'
              }}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* Tab: Dados da Clínica */}
        {activeTab === 'dados' && (
          <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
            <h2 className="text-xl font-semibold mb-6" style={{ color: '#2C7464' }}>
              Dados Cadastrais
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Nome da Clínica
                </Label>
                <Input
                  value={clinicaData.nome || ''}
                  onChange={(e) => setClinicaData({ ...clinicaData, nome: e.target.value })}
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  E-mail
                </Label>
                <Input
                  type="email"
                  value={clinicaData.email || ''}
                  onChange={(e) => setClinicaData({ ...clinicaData, email: e.target.value })}
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>
            </div>

            <h3 className="text-lg font-semibold mt-8 mb-4" style={{ color: '#2C7464' }}>
              Contato
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Telefone Principal
                </Label>
                <Input
                  value={clinicaData.telefone || ''}
                  onChange={(e) => setClinicaData({ ...clinicaData, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Endereço
                </Label>
                <Input
                  value={clinicaData.endereco || ''}
                  onChange={(e) => setClinicaData({ ...clinicaData, endereco: e.target.value })}
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>
            </div>

            <div className="mt-6">
              <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                Descrição
              </Label>
              <Textarea
                value={clinicaData.descricao || ''}
                onChange={(e) => setClinicaData({ ...clinicaData, descricao: e.target.value })}
                rows={3}
                className="mt-1"
                style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
              />
            </div>

            <div className="flex justify-end mt-8">
              <Button
                onClick={handleSaveClinica}
                disabled={saving}
                className="flex items-center gap-2"
                style={{ backgroundColor: '#2C7464', color: 'white' }}
              >
                <Save size={18} />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </Card>
        )}

        {/* Tab: Automação */}
        {activeTab === 'automacao' && (
          <div className="space-y-6">
            {/* Card WhatsApp */}
            <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
              <h2 className="text-xl font-semibold mb-6" style={{ color: '#2C7464' }}>
                Integração WhatsApp
              </h2>
              <div className="flex flex-col items-center justify-center py-12">
                <div 
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#F7F1EB' }}
                >
                  <QrCode size={40} style={{ color: '#2C7464' }} />
                </div>
                <p className="text-gray-500 mb-6">
                  Conecte seu WhatsApp para enviar lembretes automáticos
                </p>
                <Button
                  className="flex items-center gap-2"
                  style={{ backgroundColor: '#25D366', color: 'white' }}
                >
                  <QrCode size={18} />
                  Gerar QR Code
                </Button>
              </div>
            </Card>

            {/* Card Mensagens Modelo */}
            <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
              <h2 className="text-xl font-semibold mb-6" style={{ color: '#2C7464' }}>
                Mensagens Modelo
              </h2>
              
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Lembrete de Consulta
                </Label>
                <Textarea
                  value={mensagemLembrete}
                  onChange={(e) => setMensagemLembrete(e.target.value)}
                  rows={4}
                  className="mt-2"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                  placeholder="Use {nome}, {data} e {horario} como variáveis"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Variáveis disponíveis: {'{nome}'}, {'{data}'}, {'{horario}'}, {'{profissional}'}, {'{procedimento}'}
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <Button
                  className="flex items-center gap-2"
                  style={{ backgroundColor: '#2C7464', color: 'white' }}
                >
                  <Save size={18} />
                  Salvar Mensagem
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Horário de Atendimento */}
        {activeTab === 'horarios' && (
          <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
            <h2 className="text-xl font-semibold mb-6" style={{ color: '#2C7464' }}>
              Horário de Funcionamento
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Defina os horários de funcionamento da clínica. A agenda respeitará esses limites.
              Você pode adicionar múltiplos turnos por dia (ex: manhã e tarde).
            </p>
            
            <div className="space-y-4">
              {horarios.map((horario) => {
                const dia = DIAS_SEMANA.find(d => d.value === horario.dia_semana);
                return (
                  <div 
                    key={horario.dia_semana} 
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: '#F7F1EB' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium" style={{ color: '#292726' }}>
                        {dia?.label}
                      </span>
                      <button
                        onClick={() => addTurno(horario.dia_semana)}
                        className="text-sm flex items-center gap-1 hover:opacity-80"
                        style={{ color: '#2C7464' }}
                      >
                        <Plus size={14} />
                        Adicionar turno
                      </button>
                    </div>
                    
                    {horario.turnos.map((turno, turnoIndex) => (
                      <div key={turnoIndex} className="flex items-center gap-3 mb-2">
                        <Select 
                          value={turno.hora_inicio} 
                          onValueChange={(value) => updateTurno(horario.dia_semana, turnoIndex, 'hora_inicio', value)}
                        >
                          <SelectTrigger className="w-28" style={{ backgroundColor: 'white', borderColor: '#E5E0DA' }}>
                            <SelectValue placeholder="Início" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {HORAS.map(h => (
                              <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <span className="text-gray-400">até</span>
                        
                        <Select 
                          value={turno.hora_fim} 
                          onValueChange={(value) => updateTurno(horario.dia_semana, turnoIndex, 'hora_fim', value)}
                        >
                          <SelectTrigger className="w-28" style={{ backgroundColor: 'white', borderColor: '#E5E0DA' }}>
                            <SelectValue placeholder="Fim" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {HORAS.map(h => (
                              <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {horario.turnos.length > 1 && (
                          <button
                            onClick={() => removeTurno(horario.dia_semana, turnoIndex)}
                            className="p-1 rounded hover:bg-red-100"
                          >
                            <Trash2 size={16} className="text-red-500" />
                          </button>
                        )}
                        
                        {!turno.hora_inicio && !turno.hora_fim && turnoIndex === 0 && horario.turnos.length === 1 && (
                          <span className="text-sm text-gray-400">Fechado</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-8">
              <Button
                onClick={handleSaveHorarios}
                disabled={saving}
                className="flex items-center gap-2"
                style={{ backgroundColor: '#2C7464', color: 'white' }}
              >
                <Save size={18} />
                {saving ? 'Salvando...' : 'Salvar Horários'}
              </Button>
            </div>
          </Card>
        )}

        {/* Tab: Histórico */}
        {activeTab === 'historico' && (
          <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
            <h2 className="text-xl font-semibold mb-6" style={{ color: '#2C7464' }}>
              Histórico de Pagamentos
            </h2>
            
            {assinaturas.length === 0 ? (
              <div className="text-center py-12">
                <History size={48} className="mx-auto mb-4" style={{ color: '#E5E0DA' }} />
                <p className="text-gray-500">Nenhum histórico de pagamento disponível</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: '#E5E0DA' }}>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: '#6B7280' }}>Data</th>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: '#6B7280' }}>Plano</th>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: '#6B7280' }}>Valor</th>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: '#6B7280' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assinaturas.map((assinatura, index) => (
                      <tr key={index} className="border-b" style={{ borderColor: '#E5E0DA' }}>
                        <td className="py-3 px-4">{new Date(assinatura.started_at).toLocaleDateString('pt-BR')}</td>
                        <td className="py-3 px-4">{assinatura.plano?.nome}</td>
                        <td className="py-3 px-4">R$ {assinatura.plano?.preco?.toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <span 
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              assinatura.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : assinatura.status === 'past_due'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {assinatura.status === 'active' ? 'Ativo' : 
                             assinatura.status === 'past_due' ? 'Pendente' : 'Cancelado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default Configuracoes;