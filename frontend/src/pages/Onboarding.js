import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'sonner';
import { Building2, Clock, ChevronRight, ChevronLeft, Check, Plus, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../context/AuthContext';

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const HORAS = Array.from({ length: 24 }, (_, i) => {
  const hora = String(i).padStart(2, '0');
  return { value: `${hora}:00`, label: `${hora}:00` };
}).concat(
  Array.from({ length: 24 }, (_, i) => {
    const hora = String(i).padStart(2, '0');
    return { value: `${hora}:30`, label: `${hora}:30` };
  })
).sort((a, b) => a.value.localeCompare(b.value));

// Função para formatar telefone
const formatPhone = (value) => {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');
  if (numbers.length <= 2) return `(${numbers}`;
  if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [clinicaId, setClinicaId] = useState(null);

  // Step 1: Dados da clínica
  const [clinicaData, setClinicaData] = useState({
    nome: '',
    telefone: '',
    email: user?.email || '',
    descricao: '',
    endereco: ''
  });

  // Step 2: Horários de atendimento
  const [horarios, setHorarios] = useState(
    DIAS_SEMANA.map(dia => ({
      dia_semana: dia.value,
      turnos: [{ hora_inicio: '', hora_fim: '' }]
    }))
  );

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

  const handleStep1Submit = async () => {
    if (!clinicaData.nome) {
      toast.error('Preencha o nome da clínica');
      return;
    }

    try {
      setSaving(true);
      const response = await api.post('/config/info-clinica', clinicaData);
      setClinicaId(response.data.id);
      
      // Atualizar o contexto com o novo id_info_clinica
      updateUser({ id_info_clinica: response.data.id });
      
      setStep(2);
      toast.success('Dados salvos!');
    } catch (error) {
      toast.error('Erro ao salvar dados da clínica');
    } finally {
      setSaving(false);
    }
  };

  const handleStep2Submit = async () => {
    try {
      setSaving(true);
      
      // Salvar horários preenchidos
      for (const horario of horarios) {
        for (const turno of horario.turnos) {
          if (turno.hora_inicio && turno.hora_fim) {
            await api.post('/config/horarios-clinica', {
              dia_semana: horario.dia_semana,
              hora_inicio: turno.hora_inicio,
              hora_fim: turno.hora_fim
            });
          }
        }
      }

      // Marcar onboarding como completo
      await api.put(`/config/info-clinica/${clinicaId}`, {
        onboarding_completo: true
      });

      // Atualizar contexto
      updateUser({ onboarding_completo: true });

      toast.success('Configuração concluída!');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Erro ao salvar horários');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F7F1EB' }}>
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Bem-vindo ao Agenda Magnética
          </h1>
          <p className="mt-2 text-lg" style={{ color: '#292726' }}>
            Vamos configurar sua clínica em poucos passos
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'text-white' : 'text-gray-400 bg-gray-200'}`}
              style={{ backgroundColor: step >= 1 ? '#2C7464' : undefined }}
            >
              {step > 1 ? <Check size={20} /> : '1'}
            </div>
            <span className="font-medium" style={{ color: step >= 1 ? '#2C7464' : '#9CA3AF' }}>
              Dados da Clínica
            </span>
          </div>
          
          <div className="w-16 h-1 rounded" style={{ backgroundColor: step > 1 ? '#2C7464' : '#E5E7EB' }} />
          
          <div className="flex items-center gap-2">
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'text-white' : 'text-gray-400 bg-gray-200'}`}
              style={{ backgroundColor: step >= 2 ? '#2C7464' : undefined }}
            >
              2
            </div>
            <span className="font-medium" style={{ color: step >= 2 ? '#2C7464' : '#9CA3AF' }}>
              Horários
            </span>
          </div>
        </div>

        {/* Step 1: Dados da Clínica */}
        {step === 1 && (
          <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
                <Building2 size={24} style={{ color: '#2C7464' }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold" style={{ color: '#2C7464' }}>
                  Dados da Clínica
                </h2>
                <p className="text-sm text-gray-500">Informações básicas do seu negócio</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Nome da Clínica *
                </Label>
                <Input
                  value={clinicaData.nome}
                  onChange={(e) => setClinicaData({ ...clinicaData, nome: e.target.value })}
                  placeholder="Ex: Clínica Bem Estar"
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                    Telefone
                  </Label>
                  <Input
                    value={clinicaData.telefone}
                    onChange={(e) => setClinicaData({ ...clinicaData, telefone: formatPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
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
                    value={clinicaData.email}
                    onChange={(e) => setClinicaData({ ...clinicaData, email: e.target.value })}
                    className="mt-1"
                    style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Endereço
                </Label>
                <Input
                  value={clinicaData.endereco}
                  onChange={(e) => setClinicaData({ ...clinicaData, endereco: e.target.value })}
                  placeholder="Rua, número, bairro, cidade"
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>

              <div>
                <Label className="text-sm font-medium" style={{ color: '#292726' }}>
                  Descrição
                </Label>
                <Textarea
                  value={clinicaData.descricao}
                  onChange={(e) => setClinicaData({ ...clinicaData, descricao: e.target.value })}
                  placeholder="Breve descrição sobre a clínica..."
                  rows={3}
                  className="mt-1"
                  style={{ backgroundColor: '#F7F1EB', borderColor: '#E5E0DA' }}
                />
              </div>
            </div>

            <div className="flex justify-end mt-8">
              <Button
                onClick={handleStep1Submit}
                disabled={saving}
                className="flex items-center gap-2 px-6"
                style={{ backgroundColor: '#2C7464', color: 'white' }}
              >
                {saving ? 'Salvando...' : 'Próximo'}
                <ChevronRight size={18} />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Horários de Atendimento */}
        {step === 2 && (
          <Card className="p-8 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
                <Clock size={24} style={{ color: '#2C7464' }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold" style={{ color: '#2C7464' }}>
                  Horário de Atendimento
                </h2>
                <p className="text-sm text-gray-500">Defina os horários de funcionamento</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
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
                        
                        {!turno.hora_inicio && !turno.hora_fim && turnoIndex === 0 && (
                          <span className="text-sm text-gray-400">Fechado</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex items-center gap-2"
              >
                <ChevronLeft size={18} />
                Voltar
              </Button>
              <Button
                onClick={handleStep2Submit}
                disabled={saving}
                className="flex items-center gap-2 px-6"
                style={{ backgroundColor: '#2C7464', color: 'white' }}
              >
                {saving ? 'Finalizando...' : 'Concluir'}
                <Check size={18} />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
