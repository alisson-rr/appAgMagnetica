import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { 
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  Clock
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';
import { format, addDays, startOfWeek, isSameDay, getDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const HOUR_HEIGHT = 80; // Altura de cada bloco de hora em pixels
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const TIMEZONE = 'America/Sao_Paulo';
const TIMEZONE_OFFSET = '-03:00'; // UTC-03:00

// Helper para criar datetime com timezone explícito (sem conversão)
const createDateTimeWithOffset = (dateStr, hours, minutes) => {
  return `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${TIMEZONE_OFFSET}`;
};

const AgendaNew = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultas, setConsultas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [horariosClinica, setHorariosClinica] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);

  const [formData, setFormData] = useState({
    id_cliente: '',
    id_profissional: '',
    id_procedimento: '',
    data_inicio: '',
    hora_inicio: '',
    status: 'pendente',
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const [consultasRes, clientesRes, profissionaisRes, procedimentosRes, horariosRes] = await Promise.all([
        api.get(`/consultas?data_inicio=${dateStr}&data_fim=${dateStr}`),
        api.get('/clientes'),
        api.get('/profissionais'),
        api.get('/procedimentos'),
        api.get('/config/horarios-clinica')
      ]);

      setConsultas(consultasRes.data || []);
      setClientes(clientesRes.data || []);
      setProfissionais(profissionaisRes.data || []);
      setProcedimentos(procedimentosRes.data || []);
      setHorariosClinica(horariosRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Obter horário de funcionamento para o dia selecionado
  // Considera múltiplos turnos e retorna do menor hora_inicio ao maior hora_fim
  const getHorariosDoDia = () => {
    // getDay retorna 0 para domingo, 1 para segunda, etc.
    // Nossa tabela usa 1 para segunda, 7 para domingo
    const jsDay = getDay(selectedDate);
    const dbDay = jsDay === 0 ? 7 : jsDay;
    
    // Filtrar todos os turnos do dia (pode haver múltiplos: manhã e tarde, por exemplo)
    const horariosDoDia = horariosClinica.filter(h => h.dia_semana === dbDay);
    
    if (horariosDoDia.length > 0) {
      // Pegar o menor hora_inicio e o maior hora_fim de todos os turnos
      let minStartHour = 24;
      let maxEndHour = 0;
      
      horariosDoDia.forEach(h => {
        if (h.hora_inicio && h.hora_fim) {
          const start = parseInt(h.hora_inicio.split(':')[0]);
          const end = parseInt(h.hora_fim.split(':')[0]);
          if (start < minStartHour) minStartHour = start;
          if (end > maxEndHour) maxEndHour = end;
        }
      });
      
      if (minStartHour < 24 && maxEndHour > 0) {
        return { startHour: minStartHour, endHour: maxEndHour, isOpen: true };
      }
    }
    
    // Se não houver horário configurado, usar padrão
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR, isOpen: false };
  };

  const { startHour, endHour, isOpen } = getHorariosDoDia();
  const HOURS = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

  const parseTimeFromInterval = (intervalo) => {
    // Extrair datetime completo do intervalo e converter de UTC para hora local
    // Formato: ["2025-02-05 10:00:00+00","2025-02-05 11:00:00+00")
    const match = intervalo?.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      // Criar data UTC e converter para timezone local
      const utcDate = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
      const localDate = toZonedTime(utcDate, TIMEZONE);
      return { hour: localDate.getHours(), minute: localDate.getMinutes() };
    }
    return null;
  };

  const getDurationInMinutes = (intervalo) => {
    // Extrair ambos os datetimes e calcular diferença
    const regex = /(\d{4}-\d{2}-\d{2})\s(\d{2}):(\d{2}):(\d{2})/g;
    const matches = [...(intervalo?.matchAll(regex) || [])];
    if (matches.length === 2) {
      const startDate = new Date(`${matches[0][1]}T${matches[0][2]}:${matches[0][3]}:${matches[0][4]}Z`);
      const endDate = new Date(`${matches[1][1]}T${matches[1][2]}:${matches[1][3]}:${matches[1][4]}Z`);
      return Math.round((endDate - startDate) / 60000); // Diferença em minutos
    }
    return 60;
  };

  const calculatePosition = (intervalo) => {
    const time = parseTimeFromInterval(intervalo);
    if (!time) return { top: 0, height: HOUR_HEIGHT };
    
    const offsetHours = time.hour - startHour;
    const offsetMinutes = time.minute;
    const top = (offsetHours * HOUR_HEIGHT) + (offsetMinutes * HOUR_HEIGHT / 60);
    
    const duration = getDurationInMinutes(intervalo);
    const height = (duration / 60) * HOUR_HEIGHT;
    
    return { top, height };
  };

  // Calcular layout de colunas para agendamentos sobrepostos
  const calculateColumnsLayout = (consultasList) => {
    if (!consultasList || consultasList.length === 0) return [];

    // Extrair início e fim em minutos para cada consulta
    const items = consultasList.map(consulta => {
      const time = parseTimeFromInterval(consulta.intervalo);
      const duration = getDurationInMinutes(consulta.intervalo);
      const startMinutes = time ? (time.hour * 60 + time.minute) : 0;
      const endMinutes = startMinutes + duration;
      return { consulta, startMinutes, endMinutes };
    });

    // Ordenar por hora de início
    items.sort((a, b) => a.startMinutes - b.startMinutes);

    // Algoritmo para atribuir colunas
    const result = [];
    const columns = []; // Array de arrays, cada coluna contém os items nela

    for (const item of items) {
      // Encontrar a primeira coluna onde não há sobreposição
      let columnIndex = -1;
      for (let i = 0; i < columns.length; i++) {
        const lastItemInColumn = columns[i][columns[i].length - 1];
        if (lastItemInColumn.endMinutes <= item.startMinutes) {
          columnIndex = i;
          break;
        }
      }

      if (columnIndex === -1) {
        // Criar nova coluna
        columnIndex = columns.length;
        columns.push([]);
      }

      columns[columnIndex].push(item);
      
      // Calcular quantas colunas existem no momento da sobreposição
      // Para isso, precisamos saber quantos items se sobrepõem com este
      const overlappingCount = items.filter(other => 
        other.startMinutes < item.endMinutes && other.endMinutes > item.startMinutes
      ).length;

      result.push({
        consulta: item.consulta,
        column: columnIndex,
        totalColumns: Math.max(overlappingCount, 1)
      });
    }

    // Segunda passagem: recalcular totalColumns corretamente para cada grupo de sobreposição
    for (const item of result) {
      const itemData = items.find(i => i.consulta.id === item.consulta.id);
      const overlapping = result.filter(other => {
        const otherData = items.find(i => i.consulta.id === other.consulta.id);
        return otherData.startMinutes < itemData.endMinutes && otherData.endMinutes > itemData.startMinutes;
      });
      item.totalColumns = overlapping.length;
    }

    return result;
  };

  const getTimeFromPosition = (yPosition) => {
    const totalMinutes = (yPosition / HOUR_HEIGHT) * 60;
    const hours = Math.floor(totalMinutes / 60) + startHour;
    const minutes = Math.round((totalMinutes % 60) / 15) * 15; // Arredondar para 15min
    
    return { hours: Math.min(endHour, Math.max(startHour, hours)), minutes: Math.min(45, Math.max(0, minutes)) };
  };

  const handleDragStart = (e, consulta) => {
    setDraggedItem(consulta);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedItem) {
      const rect = e.currentTarget.getBoundingClientRect();
      const yPosition = e.clientY - rect.top;
      const newTime = getTimeFromPosition(yPosition);
      
      setDragOverPosition({
        top: (newTime.hours - 8) * HOUR_HEIGHT + (newTime.minutes / 60) * HOUR_HEIGHT,
        height: getDurationInMinutes(draggedItem.intervalo) / 60 * HOUR_HEIGHT
      });
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    
    if (!draggedItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const yPosition = e.clientY - rect.top;
    const newTime = getTimeFromPosition(yPosition);
    
    try {
      // Criar datetime com timezone explícito (hora local + offset)
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const isoWithTimezone = createDateTimeWithOffset(dateStr, newTime.hours, newTime.minutes);
      
      const duration = getDurationInMinutes(draggedItem.intervalo);
      
      const payload = {
        id_cliente: draggedItem.id_cliente,
        id_profissional: draggedItem.id_profissional,
        id_procedimento: draggedItem.id_procedimento,
        data_inicio: isoWithTimezone,
        duracao_minutos: duration,
        status: draggedItem.status
      };

      await api.put(`/consultas/${draggedItem.id}`, payload);
      toast.success('Horário atualizado!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao atualizar horário');
    } finally {
      setDraggedItem(null);
      setDragOverPosition(null);
    }
  };

  const openModal = (consulta = null) => {
    setEditingItem(consulta);
    
    if (consulta) {
      const intervalo = consulta.intervalo || '';
      // Extrair datetime UTC e converter para hora local
      const match = intervalo.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}):(\d{2}):(\d{2})/);
      let dataInicio = format(selectedDate, 'yyyy-MM-dd');
      let horaInicio = '';
      
      if (match) {
        // Criar data UTC e converter para timezone local
        const utcDate = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
        const localDate = toZonedTime(utcDate, TIMEZONE);
        dataInicio = format(localDate, 'yyyy-MM-dd');
        horaInicio = format(localDate, 'HH:mm');
      }
      
      setFormData({
        id_cliente: consulta.id_cliente?.toString() || '',
        id_profissional: consulta.id_profissional?.toString() || '',
        id_procedimento: consulta.id_procedimento?.toString() || '',
        data_inicio: dataInicio,
        hora_inicio: horaInicio,
        status: consulta.status || 'pendente',
      });
    } else {
      setFormData({
        id_cliente: '',
        id_profissional: '',
        id_procedimento: '',
        data_inicio: format(selectedDate, 'yyyy-MM-dd'),
        hora_inicio: `${String(startHour).padStart(2, '0')}:00`,
        status: 'pendente',
      });
    }
    
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!formData.id_cliente || !formData.id_profissional || !formData.id_procedimento || !formData.data_inicio || !formData.hora_inicio) {
        toast.error('Preencha todos os campos obrigatórios');
        return;
      }

      const procedimento = procedimentos.find(p => p.id === parseInt(formData.id_procedimento));
      
      if (!procedimento) {
        toast.error('Procedimento não encontrado');
        return;
      }

      // Criar datetime com timezone explícito (hora local + offset)
      const [hours, minutes] = formData.hora_inicio.split(':').map(Number);
      const isoWithTimezone = createDateTimeWithOffset(formData.data_inicio, hours, minutes);
      
      const payload = {
        id_cliente: parseInt(formData.id_cliente),
        id_profissional: parseInt(formData.id_profissional),
        id_procedimento: parseInt(formData.id_procedimento),
        data_inicio: isoWithTimezone,
        duracao_minutos: procedimento.duracao_minutos || 60,
        status: formData.status
      };

      if (editingItem) {
        await api.put(`/consultas/${editingItem.id}`, payload);
        toast.success('Consulta atualizada!');
      } else {
        await api.post('/consultas', payload);
        toast.success('Consulta criada!');
      }

      setModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja deletar?')) return;

    try {
      await api.delete(`/consultas/${id}`);
      toast.success('Deletado com sucesso!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao deletar');
    }
  };

  const handleConcluir = async (consulta) => {
    try {
      const duration = getDurationInMinutes(consulta.intervalo);
      const time = parseTimeFromInterval(consulta.intervalo);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      // Criar datetime com timezone explícito (hora local + offset)
      const isoWithTimezone = createDateTimeWithOffset(dateStr, time.hour, time.minute);
      
      const payload = {
        id_cliente: consulta.id_cliente,
        id_profissional: consulta.id_profissional,
        id_procedimento: consulta.id_procedimento,
        data_inicio: isoWithTimezone,
        duracao_minutos: duration,
        status: 'concluido'
      };

      await api.put(`/consultas/${consulta.id}`, payload);
      toast.success('Serviço marcado como concluído!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao concluir serviço');
    }
  };

  const getWeekDays = () => {
    const start = startOfWeek(selectedDate, { locale: ptBR });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  // Coral marca atenção (pendente); verde marca sucesso. Vermelho fica só para erro.
  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmado': return 'hsl(var(--am-green))';
      case 'concluido': return 'hsl(var(--am-green-lum))';
      case 'cancelado': return 'hsl(var(--muted-foreground))';
      case 'pendente':
      default: return 'hsl(var(--am-coral))';
    }
  };

  return (
    <div className="page-shell">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <PageHeader
          title="Agenda"
          description="Os horários do dia, com status visível e reposicionamento por arrastar."
        >
          <DialogTrigger asChild>
            <Button data-testid="nova-marcacao-button" onClick={() => openModal()} size="lg">
              <Plus className="w-5 h-5" />
              Nova marcação
            </Button>
          </DialogTrigger>
        </PageHeader>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Editar' : 'Nova'} Marcação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={formData.id_cliente} onValueChange={(value) => setFormData({ ...formData, id_cliente: value })} required>
                  <SelectTrigger data-testid="select-cliente" aria-label="Cliente"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {clientes.map((c) => (<SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select value={formData.id_profissional} onValueChange={(value) => setFormData({ ...formData, id_profissional: value })} required>
                  <SelectTrigger data-testid="select-profissional" aria-label="Profissional"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {profissionais.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Procedimento</Label>
                <Select value={formData.id_procedimento} onValueChange={(value) => setFormData({ ...formData, id_procedimento: value })} required>
                  <SelectTrigger data-testid="select-procedimento" aria-label="Procedimento"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {procedimentos.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.nome} - {p.duracao_minutos}min - R$ {p.valor?.toFixed(2)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="agenda-data">Data</Label>
                  <Input
                    id="agenda-data"
                    type="date"
                    data-testid="input-data"
                    value={formData.data_inicio}
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agenda-hora">Hora</Label>
                  <Input
                    id="agenda-hora"
                    type="time"
                    data-testid="input-hora"
                    value={formData.hora_inicio}
                    onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger data-testid="select-status" aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" data-testid="submit-agendamento">Salvar</Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      {/* Calendário semanal */}
      <Card className="p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            data-testid="previous-week-button"
            aria-label="Semana anterior"
            className="icon-action"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-display text-lg font-bold capitalize text-ink">
            {format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <button
            type="button"
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            data-testid="next-week-button"
            aria-label="Próxima semana"
            className="icon-action"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {getWeekDays().map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            return (
              <button
                key={day.toString()}
                type="button"
                onClick={() => setSelectedDate(day)}
                data-testid={`day-${format(day, 'yyyy-MM-dd')}`}
                aria-pressed={isSelected}
                className={`rounded-xl px-1 py-3 text-center transition sm:px-3 sm:py-4 ${
                  isSelected
                    ? 'bg-primary text-white shadow-[var(--shadow-green)]'
                    : 'text-foreground/75 hover:bg-accent'
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase">
                  {format(day, 'EEE', { locale: ptBR })}
                </span>
                <span className="mt-1 block font-display text-xl font-bold sm:text-2xl">{format(day, 'd')}</span>
                <span
                  className={`mx-auto mt-1 block h-1 w-1 rounded-full ${
                    isToday ? (isSelected ? 'bg-apricot' : 'bg-coral') : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </Card>

      {/* Timeline de Horários - Estilo Google Calendar */}
      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold capitalize text-ink">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Legenda de status">
            {[
              ['Pendente', 'badge-attention'],
              ['Confirmado', 'badge-success'],
              ['Concluído', 'badge-success'],
              ['Cancelado', 'badge-neutral'],
            ].map(([texto, classe]) => (
              <li key={texto} className={`badge ${classe}`}>{texto}</li>
            ))}
          </ul>
        </div>

        {loading ? (
          <Loading label="Carregando agenda do dia" />
        ) : consultas.length === 0 ? (
          <EmptyState
            icon={CalendarIcon}
            title={isOpen ? 'Nenhum horário marcado neste dia' : 'Sem horário de funcionamento neste dia'}
            description={
              isOpen
                ? 'Use “Nova marcação” para registrar um atendimento.'
                : 'Configure o funcionamento do negócio em Configurações para liberar a agenda deste dia.'
            }
          />
        ) : (
          <div className="flex overflow-x-auto" style={{ position: 'relative', minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}>
            {/* Coluna de Horários */}
            <div className="w-14 flex-shrink-0 sm:w-20">
              {HOURS.map((hour) => (
                <div key={hour} style={{ height: `${HOUR_HEIGHT}px` }} className="flex items-start justify-end pr-2 text-xs font-semibold text-muted-foreground sm:pr-3 sm:text-sm">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Área de Agendamentos */}
            <div className="relative min-w-[260px] flex-1 border-l border-border/60" style={{ minHeight: `${HOURS.length * HOUR_HEIGHT}px` }} onDragOver={handleDragOver} onDrop={handleDrop}>
              {/* Linhas de grade */}
              <div className="absolute inset-0">
                {HOURS.map((hour) => (
                  <div key={hour} style={{ height: `${HOUR_HEIGHT}px` }} className="border-b border-border/50" />
                ))}
              </div>

              {/* Pré-visualização do drag */}
              {dragOverPosition && (
                <div
                  className="pointer-events-none absolute left-2 right-2 rounded-xl border-2 border-dashed border-primary bg-primary/10"
                  style={{
                    top: `${dragOverPosition.top}px`,
                    height: `${dragOverPosition.height}px`,
                    zIndex: 5
                  }}
                />
              )}

              {/* Agendamentos posicionados com layout de colunas */}
              <div className="absolute inset-0">
                {calculateColumnsLayout(consultas).map(({ consulta, column, totalColumns }) => {
                const { top, height } = calculatePosition(consulta.intervalo);
                const time = parseTimeFromInterval(consulta.intervalo);
                const timeStr = time ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '--:--';
                
                // Calcular posição horizontal baseado na coluna
                const GAP = 4; // Gap entre colunas em pixels
                const PADDING = 8; // Padding lateral
                const availableWidth = `calc(100% - ${PADDING * 2}px)`;
                const columnWidth = `calc((${availableWidth} - ${(totalColumns - 1) * GAP}px) / ${totalColumns})`;
                const leftOffset = `calc(${PADDING}px + (${columnWidth} + ${GAP}px) * ${column})`;

                return (
                  <div
                    key={consulta.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, consulta)}
                    data-testid={`agendamento-${consulta.id}`}
                    className="absolute cursor-move overflow-hidden rounded-xl border border-border/70 bg-card p-2 shadow-soft transition hover:shadow-card"
                    style={{
                      top: `${top}px`,
                      left: leftOffset,
                      width: columnWidth,
                      height: `${Math.max(height, 60)}px`,
                      borderLeft: `4px solid ${getStatusColor(consulta.status)}`,
                      zIndex: 10
                    }}
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-bold text-ink">
                          {timeStr} · {consulta.cliente?.nome}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {consulta.procedimento?.nome}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {consulta.profissional?.nome}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openModal(consulta)}
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-primary"
                          aria-label={`Editar agendamento de ${consulta.cliente?.nome || 'cliente'}`}
                          title="Editar"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        {consulta.status !== 'concluido' && (
                          <button
                            type="button"
                            onClick={() => handleConcluir(consulta)}
                            className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-green-deep"
                            aria-label={`Concluir agendamento de ${consulta.cliente?.nome || 'cliente'}`}
                            title="Concluir"
                          >
                            Concluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AgendaNew;
