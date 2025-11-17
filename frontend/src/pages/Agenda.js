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
import { Textarea } from '../components/ui/textarea';
import { format, addDays, startOfWeek, endOfWeek, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Componente de item drag\u00e1vel
const SortableAgendamento = ({ agendamento, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: agendamento.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmado':
        return '#2C7464';
      case 'pendente':
        return '#FEA5A4';
      case 'cancelado':
        return '#ccc';
      case 'pago':
        return '#2C7464';
      default:
        return '#FEA5A4';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-4 mb-3 rounded-xl shadow-md cursor-move"
      data-testid={`agendamento-card-${agendamento.id}`}
      style={{
        ...style,
        backgroundColor: 'white',
        borderLeft: `4px solid ${getStatusColor(agendamento.status)}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium" style={{ color: '#2C7464' }}>
            {agendamento.cliente?.nome || 'Cliente'}
          </p>
          <p className="text-sm mt-1" style={{ color: '#292726' }}>
            {agendamento.procedimento?.nome || 'Procedimento'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#292726' }}>
            {agendamento.profissional?.nome || 'Profissional'}
          </p>
          <div className="flex items-center mt-2 text-xs" style={{ color: '#292726' }}>
            <Clock className="w-3 h-3 mr-1" />
            {/* Hor\u00e1rio aqui */}
          </div>
        </div>
        <div className="flex flex-col space-y-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(agendamento);
            }}
            data-testid={`edit-agendamento-${agendamento.id}`}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Edit className="w-4 h-4" style={{ color: '#2C7464' }} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(agendamento.id);
            }}
            data-testid={`delete-agendamento-${agendamento.id}`}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Trash2 className="w-4 h-4" style={{ color: '#FEA5A4' }} />
          </button>
        </div>
      </div>
      <span
        className="inline-block px-2 py-1 text-xs font-medium rounded-full mt-2"
        style={{
          backgroundColor: getStatusColor(agendamento.status),
          color: 'white'
        }}
      >
        {agendamento.status}
      </span>
    </div>
  );
};

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultas, setConsultas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('consulta'); // 'consulta' ou 'bloqueio'
  const [editingItem, setEditingItem] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    id_cliente: '',
    id_profissional: '',
    id_procedimento: '',
    data_inicio: '',
    hora_inicio: '',
    status: 'pendente',
    motivo: '' // para bloqueio
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setConsultas((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);
    
    if (item) {
      setFormData({
        id_cliente: item.id_cliente || '',
        id_profissional: item.id_profissional || '',
        id_procedimento: item.id_procedimento || '',
        data_inicio: format(selectedDate, 'yyyy-MM-dd'),
        hora_inicio: '',
        observacoes: item.observacoes || '',
        status: item.status || 'pendente',
        motivo: item.motivo || ''
      });
    } else {
      setFormData({
        id_cliente: '',
        id_profissional: '',
        id_procedimento: '',
        data_inicio: format(selectedDate, 'yyyy-MM-dd'),
        hora_inicio: '',
        observacoes: '',
        status: 'pendente',
        motivo: ''
      });
    }
    
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (modalType === 'consulta') {
        const procedimento = procedimentos.find(p => p.id === parseInt(formData.id_procedimento));
        const dataHora = new Date(`${formData.data_inicio}T${formData.hora_inicio}`);
        
        const payload = {
          id_cliente: parseInt(formData.id_cliente),
          id_profissional: parseInt(formData.id_profissional),
          id_procedimento: parseInt(formData.id_procedimento),
          data_inicio: dataHora.toISOString(),
          duracao_minutos: procedimento?.duracao_minutos || 60,
          status: formData.status,
          observacoes: formData.observacoes
        };

        if (editingItem) {
          await api.put(`/consultas/${editingItem.id}`, payload);
          toast.success('Consulta atualizada com sucesso!');
        } else {
          await api.post('/consultas', payload);
          toast.success('Consulta criada com sucesso!');
        }
      } else {
        // Bloqueio
        const dataHoraInicio = new Date(`${formData.data_inicio}T${formData.hora_inicio}`);
        const dataHoraFim = new Date(dataHoraInicio.getTime() + 60 * 60 * 1000); // 1 hora

        const payload = {
          id_profissional: parseInt(formData.id_profissional),
          data_inicio: dataHoraInicio.toISOString(),
          data_fim: dataHoraFim.toISOString(),
          motivo: formData.motivo
        };

        await api.post('/bloqueios', payload);
        toast.success('Bloqueio criado com sucesso!');
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

  const getWeekDays = () => {
    const start = startOfWeek(selectedDate, { locale: ptBR });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
              onClick={() => openModal('consulta')}
              className="rounded-full px-6 py-6 text-white"
              style={{ backgroundColor: '#2C7464' }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova Marca\u00e7\u00e3o
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {modalType === 'consulta' ? 'Nova Marca\u00e7\u00e3o' : 'Bloquear Hor\u00e1rio'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType === 'consulta' ? (
                <>
                  <div>
                    <Label>Cliente</Label>
                    <Select
                      value={formData.id_cliente}
                      onValueChange={(value) => setFormData({ ...formData, id_cliente: value })}
                      required
                    >
                      <SelectTrigger data-testid="select-cliente">
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientes.map((cliente) => (
                          <SelectItem key={cliente.id} value={cliente.id.toString()}>
                            {cliente.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Profissional</Label>
                    <Select
                      value={formData.id_profissional}
                      onValueChange={(value) => setFormData({ ...formData, id_profissional: value })}
                      required
                    >
                      <SelectTrigger data-testid="select-profissional">
                        <SelectValue placeholder="Selecione o profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        {profissionais.map((prof) => (
                          <SelectItem key={prof.id} value={prof.id.toString()}>
                            {prof.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Procedimento</Label>
                    <Select
                      value={formData.id_procedimento}
                      onValueChange={(value) => setFormData({ ...formData, id_procedimento: value })}
                      required
                    >
                      <SelectTrigger data-testid="select-procedimento">
                        <SelectValue placeholder="Selecione o procedimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {procedimentos.map((proc) => (
                          <SelectItem key={proc.id} value={proc.id.toString()}>
                            {proc.nome} - {proc.duracao_minutos}min - R$ {proc.valor}
                          </SelectItem>
                        ))}
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
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Observa\u00e7\u00f5es</Label>
                    <Textarea
                      data-testid="input-observacoes"
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      placeholder="Observa\u00e7\u00f5es adicionais..."
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Profissional</Label>
                    <Select
                      value={formData.id_profissional}
                      onValueChange={(value) => setFormData({ ...formData, id_profissional: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        {profissionais.map((prof) => (
                          <SelectItem key={prof.id} value={prof.id.toString()}>
                            {prof.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={formData.data_inicio}
                        onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Hora</Label>
                      <Input
                        type="time"
                        value={formData.hora_inicio}
                        onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Motivo</Label>
                    <Textarea
                      value={formData.motivo}
                      onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                      placeholder="Motivo do bloqueio..."
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  data-testid="submit-agendamento"
                  style={{ backgroundColor: '#2C7464', color: 'white' }}
                >
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calend\u00e1rio Semanal */}
      <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            data-testid="previous-week-button"
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: '#2C7464' }} />
          </button>
          
          <h2 className="text-xl font-bold" style={{ color: '#2C7464' }}>
            {format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            data-testid="next-week-button"
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ChevronRight className="w-5 h-5" style={{ color: '#2C7464' }} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {getWeekDays().map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                data-testid={`day-${format(day, 'yyyy-MM-dd')}`}
                className={`p-4 rounded-xl text-center transition-all ${
                  isSelected ? 'shadow-md' : 'hover:bg-gray-100'
                }`}
                style={{
                  backgroundColor: isSelected ? '#2C7464' : 'transparent',
                  color: isSelected ? 'white' : '#292726'
                }}
              >
                <p className="text-xs font-medium uppercase">
                  {format(day, 'EEE', { locale: ptBR })}
                </p>
                <p className="text-2xl font-bold mt-1">
                  {format(day, 'd')}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Lista de Agendamentos */}
      <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: '#2C7464' }}>
            Agendamentos do Dia
          </h2>
          <button
            onClick={() => openModal('bloqueio')}
            data-testid="bloquear-horario-button"
            className="px-4 py-2 text-sm rounded-full"
            style={{ backgroundColor: '#FEA5A4', color: 'white' }}
          >
            Bloquear Hor\u00e1rio
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
          </div>
        ) : consultas.length === 0 ? (
          <p className="text-center py-12" style={{ color: '#292726' }}>
            Nenhum agendamento para este dia
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={consultas.map(c => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {consultas.map((consulta) => (
                  <SortableAgendamento
                    key={consulta.id}
                    agendamento={consulta}
                    onEdit={openModal}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </div>
  );
};

export default Agenda;
