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

const PASSOS = [
  { numero: 1, titulo: 'Dados do negócio' },
  { numero: 2, titulo: 'Horários' },
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
      updateUser({ id_info_clinica: response.data.id }, response.data.access_token);

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4 md:p-6">
      <div className="w-full max-w-3xl py-8">
        <div className="text-center">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="mx-auto h-14" />
          <h1 className="mt-6 font-display text-3xl font-bold text-ink">Vamos configurar seu negócio</h1>
          <p className="mt-2 text-muted-foreground">Dois passos e sua agenda já entende como você atende.</p>
        </div>

        {/* Progresso */}
        <ol className="mt-8 flex items-center justify-center gap-2 sm:gap-4">
          {PASSOS.map((passo, index) => {
            const concluido = step > passo.numero;
            const atual = step === passo.numero;
            return (
              <li key={passo.numero} className="flex items-center gap-2 sm:gap-4">
                <span className="flex items-center gap-2" aria-current={atual ? 'step' : undefined}>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-bold transition ${
                      concluido || atual ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {concluido ? <Check size={18} /> : passo.numero}
                  </span>
                  <span className={`text-sm font-semibold ${concluido || atual ? 'text-primary' : 'text-muted-foreground'}`}>
                    {passo.titulo}
                  </span>
                </span>
                {index < PASSOS.length - 1 && (
                  <span className={`h-1 w-10 rounded-full sm:w-16 ${step > 1 ? 'bg-primary' : 'bg-border'}`} />
                )}
              </li>
            );
          })}
        </ol>

        {/* Passo 1: dados do negócio */}
        {step === 1 && (
          <Card className="animate-enter mt-8 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
                <Building2 size={22} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Dados do negócio</h2>
                <p className="text-sm text-muted-foreground">Informações básicas usadas no atendimento</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="clinica-nome">Nome do negócio *</Label>
                <Input
                  id="clinica-nome"
                  value={clinicaData.nome}
                  onChange={(e) => setClinicaData({ ...clinicaData, nome: e.target.value })}
                  placeholder="Ex.: Clínica Bem Estar"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="clinica-telefone">Telefone</Label>
                  <Input
                    id="clinica-telefone"
                    type="tel"
                    inputMode="tel"
                    value={clinicaData.telefone}
                    onChange={(e) => setClinicaData({ ...clinicaData, telefone: formatPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clinica-email">E-mail</Label>
                  <Input
                    id="clinica-email"
                    type="email"
                    value={clinicaData.email}
                    onChange={(e) => setClinicaData({ ...clinicaData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clinica-endereco">Endereço</Label>
                <Input
                  id="clinica-endereco"
                  value={clinicaData.endereco}
                  onChange={(e) => setClinicaData({ ...clinicaData, endereco: e.target.value })}
                  placeholder="Rua, número, bairro, cidade"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clinica-descricao">Descrição</Label>
                <Textarea
                  id="clinica-descricao"
                  value={clinicaData.descricao}
                  onChange={(e) => setClinicaData({ ...clinicaData, descricao: e.target.value })}
                  placeholder="Breve descrição sobre o negócio..."
                  rows={3}
                />
                <p className="field-hint">Ajuda a automação a se apresentar do jeito certo.</p>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button onClick={handleStep1Submit} disabled={saving} size="lg">
                {saving ? 'Salvando...' : 'Próximo'}
                <ChevronRight size={18} />
              </Button>
            </div>
          </Card>
        )}

        {/* Passo 2: horários de atendimento */}
        {step === 2 && (
          <Card className="animate-enter mt-8 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
                <Clock size={22} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Horário de atendimento</h2>
                <p className="text-sm text-muted-foreground">Deixe em branco os dias em que você não atende</p>
              </div>
            </div>

            <div className="mt-6 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {horarios.map((horario) => {
                const dia = DIAS_SEMANA.find(d => d.value === horario.dia_semana);
                return (
                  <div key={horario.dia_semana} className="surface-muted p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">{dia?.label}</span>
                      <button
                        type="button"
                        onClick={() => addTurno(horario.dia_semana)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-primary transition hover:bg-accent"
                      >
                        <Plus size={14} />
                        Adicionar turno
                      </button>
                    </div>

                    {horario.turnos.map((turno, turnoIndex) => (
                      <div key={turnoIndex} className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                        <Select
                          value={turno.hora_inicio}
                          onValueChange={(value) => updateTurno(horario.dia_semana, turnoIndex, 'hora_inicio', value)}
                        >
                          <SelectTrigger className="w-28" aria-label={`Início — ${dia?.label}`}>
                            <SelectValue placeholder="Início" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {HORAS.map(h => (
                              <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-sm text-muted-foreground">até</span>

                        <Select
                          value={turno.hora_fim}
                          onValueChange={(value) => updateTurno(horario.dia_semana, turnoIndex, 'hora_fim', value)}
                        >
                          <SelectTrigger className="w-28" aria-label={`Fim — ${dia?.label}`}>
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
                            type="button"
                            onClick={() => removeTurno(horario.dia_semana, turnoIndex)}
                            aria-label={`Remover turno de ${dia?.label}`}
                            className="icon-action icon-action-danger"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}

                        {!turno.hora_inicio && !turno.hora_fim && turnoIndex === 0 && (
                          <span className="badge badge-neutral">Fechado</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-between gap-3">
              <Button variant="outline" size="lg" onClick={() => setStep(1)}>
                <ChevronLeft size={18} />
                Voltar
              </Button>
              <Button onClick={handleStep2Submit} disabled={saving} size="lg">
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
