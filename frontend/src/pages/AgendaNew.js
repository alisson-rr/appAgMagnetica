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
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 até 20:00
const HOUR_HEIGHT = 80; // Altura de cada bloco de hora em pixels

const AgendaNew = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultas, setConsultas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
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
      const [consultasRes, clientesRes, profissionaisRes, procedimentosRes] = await Promise.all([
        api.get(`/consultas?data_inicio=${dateStr}&data_fim=${dateStr}`),
        api.get('/clientes'),
        api.get('/profissionais'),
        api.get('/procedimentos')
      ]);

      setConsultas(consultasRes.data || []);
      setClientes(clientesRes.data || []);
      setProfissionais(profissionaisRes.data || []);
      setProcedimentos(procedimentosRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const parseTimeFromInterval = (intervalo) => {
    const match = intervalo?.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? { hour: parseInt(match[1]), minute: parseInt(match[2]) } : null;
  };

  const getDurationInMinutes = (intervalo) => {
    const matches = intervalo?.match(/(\d{2}):(\d{2}):(\d{2})/g);
    if (matches && matches.length === 2) {
      const start = matches[0].split(':');
      const end = matches[1].split(':');
      const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
      const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
      return endMinutes - startMinutes;
    }
    return 60;
  };

  const calculatePosition = (intervalo) => {
    const time = parseTimeFromInterval(intervalo);
    if (!time) return { top: 0, height: HOUR_HEIGHT };
    
    const startHour = 8;
    const offsetHours = time.hour - startHour;
    const offsetMinutes = time.minute;
    const top = (offsetHours * HOUR_HEIGHT) + (offsetMinutes * HOUR_HEIGHT / 60);
    
    const duration = getDurationInMinutes(intervalo);
    const height = (duration / 60) * HOUR_HEIGHT;
    
    return { top, height };
  };

  const getTimeFromPosition = (yPosition) => {
    const startHour = 8;
    const totalMinutes = (yPosition / HOUR_HEIGHT) * 60;
    const hours = Math.floor(totalMinutes / 60) + startHour;
    const minutes = Math.round((totalMinutes % 60) / 15) * 15; // Arredondar para 15min
    
    return { hours: Math.min(20, Math.max(8, hours)), minutes: Math.min(45, Math.max(0, minutes)) };
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
      // Calcular nova data/hora
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const newDateTime = new Date(`${dateStr}T${String(newTime.hours).padStart(2, '0')}:${String(newTime.minutes).padStart(2, '0')}:00`);
      
      const duration = getDurationInMinutes(draggedItem.intervalo);
      
      const payload = {
        id_cliente: draggedItem.id_cliente,
        id_profissional: draggedItem.id_profissional,
        id_procedimento: draggedItem.id_procedimento,
        data_inicio: newDateTime.toISOString(),
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
      const match = intervalo.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})/);
      const dataInicio = match ? match[1] : format(selectedDate, 'yyyy-MM-dd');
      const horaInicio = match ? match[2] : '';
      
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
        hora_inicio: '09:00',
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

      const dataHora = new Date(`${formData.data_inicio}T${formData.hora_inicio}`);
      
      const payload = {
        id_cliente: parseInt(formData.id_cliente),
        id_profissional: parseInt(formData.id_profissional),
        id_procedimento: parseInt(formData.id_procedimento),
        data_inicio: dataHora.toISOString(),
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
      const dataHora = new Date(`${dateStr}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00`);
      
      const payload = {
        id_cliente: consulta.id_cliente,
        id_profissional: consulta.id_profissional,
        id_procedimento: consulta.id_procedimento,
        data_inicio: dataHora.toISOString(),
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'pendente': return '#FEA5A4';
      case 'cancelado': return '#ccc';
      case 'concluido': return '#2C7464';
      default: return '#FEA5A4';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Agenda
          </h1>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>
            Gerencie seus agendamentos
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="nova-marcacao-button"
              onClick={() => openModal()}
              className="rounded-full px-6 py-6 text-white"
              style={{ backgroundColor: '#2C7464' }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova Marcação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Editar' : 'Nova'} Marcação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Select value={formData.id_cliente} onValueChange={(value) => setFormData({ ...formData, id_cliente: value })} required>
                  <SelectTrigger data-testid="select-cliente"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {clientes.map((c) => (<SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Profissional</Label>
                <Select value={formData.id_profissional} onValueChange={(value) => setFormData({ ...formData, id_profissional: value })} required>
                  <SelectTrigger data-testid="select-profissional"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {profissionais.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Procedimento</Label>
                <Select value={formData.id_procedimento} onValueChange={(value) => setFormData({ ...formData, id_procedimento: value })} required>
                  <SelectTrigger data-testid="select-procedimento"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {procedimentos.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.nome} - {p.duracao_minutos}min - R$ {p.valor?.toFixed(2)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data</Label>
                  <Input 
                    type="date" 
                    data-testid="input-data" 
                    value={formData.data_inicio} 
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} 
                    required 
                    className="rounded-xl"
                    style={{ padding: '12px 16px', borderColor: '#2C7464' }}
                  />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input 
                    type="time" 
                    data-testid="input-hora" 
                    value={formData.hora_inicio} 
                    onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })} 
                    required 
                    className="rounded-xl"
                    style={{ padding: '12px 16px', borderColor: '#2C7464' }}
                  />
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" data-testid="submit-agendamento" style={{ backgroundColor: '#2C7464', color: 'white' }}>Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendário Semanal */}
      <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} data-testid="previous-week-button" className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" style={{ color: '#2C7464' }} />
          </button>
          <h2 className="text-xl font-bold" style={{ color: '#2C7464' }}>{format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} data-testid="next-week-button" className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="w-5 h-5" style={{ color: '#2C7464' }} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {getWeekDays().map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button key={day.toString()} onClick={() => setSelectedDate(day)} data-testid={`day-${format(day, 'yyyy-MM-dd')}`} className={`p-4 rounded-xl text-center transition-all ${isSelected ? 'shadow-md' : 'hover:bg-gray-100'}`} style={{ backgroundColor: isSelected ? '#2C7464' : 'transparent', color: isSelected ? 'white' : '#292726' }}>
                <p className="text-xs font-medium uppercase">{format(day, 'EEE', { locale: ptBR })}</p>
                <p className="text-2xl font-bold mt-1">{format(day, 'd')}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Timeline de Horários - Estilo Google Calendar */}
      <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2C7464' }}>
          {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
          </div>
        ) : (
          <div className="flex" style={{ position: 'relative', minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}>
            {/* Coluna de Horários */}
            <div className="w-20 flex-shrink-0">
              {HOURS.map((hour) => (
                <div key={hour} style={{ height: `${HOUR_HEIGHT}px`, color: '#292726' }} className="flex items-start justify-end pr-3 text-sm">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Área de Agendamentos */}
            <div className="flex-1 relative border-l" style={{ borderColor: '#F7F1EB', minHeight: `${HOURS.length * HOUR_HEIGHT}px` }} onDragOver={handleDragOver} onDrop={handleDrop}>
              {/* Linhas de grade */}
              <div className="absolute inset-0">
                {HOURS.map((hour) => (
                  <div key={hour} style={{ height: `${HOUR_HEIGHT}px`, borderColor: '#F7F1EB' }} className="border-b" />
                ))}
              </div>

              {/* Pré-visualização do drag */}
              {dragOverPosition && (
                <div
                  className="absolute left-2 right-2 rounded-lg border-2 border-dashed pointer-events-none"
                  style={{
                    top: `${dragOverPosition.top}px`,
                    height: `${dragOverPosition.height}px`,
                    borderColor: '#2C7464',
                    backgroundColor: 'rgba(44, 116, 100, 0.1)',
                    zIndex: 5
                  }}
                />
              )}

              {/* Agendamentos posicionados */}
              <div className="absolute inset-0">
                {consultas.map((consulta) => {
                const { top, height } = calculatePosition(consulta.intervalo);
                const time = parseTimeFromInterval(consulta.intervalo);
                const timeStr = time ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '--:--';

                return (
                  <div
                    key={consulta.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, consulta)}
                    data-testid={`agendamento-${consulta.id}`}
                    className="absolute p-3 rounded-lg shadow-md cursor-move overflow-hidden"
                    style={{
                      top: `${top}px`,
                      left: '8px',
                      right: '8px',
                      height: `${Math.max(height, 60)}px`,
                      backgroundColor: 'white',
                      borderLeft: `4px solid ${getStatusColor(consulta.status)}`,
                      zIndex: 10
                    }}
                  >
                    <div className="flex items-start justify-between h-full">
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold truncate" style={{ color: '#2C7464' }}>
                          {timeStr} - {consulta.cliente?.nome}
                        </p>
                        <p className="text-xs truncate mt-1" style={{ color: '#292726' }}>
                          {consulta.procedimento?.nome}
                        </p>
                        <p className="text-xs truncate" style={{ color: '#292726' }}>
                          {consulta.profissional?.nome}
                        </p>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button onClick={() => openModal(consulta)} className="p-2 rounded-lg hover:bg-gray-100" title="Editar">
                          <Edit className="w-4 h-4" style={{ color: '#2C7464' }} />
                        </button>
                        {consulta.status !== 'concluido' && (
                          <button 
                            onClick={() => handleConcluir(consulta)} 
                            className="px-2 py-1 text-xs font-medium rounded-lg text-white"
                            style={{ backgroundColor: '#2C7464' }}
                            title="Concluir"
                          >
                            ✓
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
