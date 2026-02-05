import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Clock, X } from 'lucide-react';
import { formatPhone, unformatPhone } from '../utils/formatters';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' }
];

const Profissionais = () => {
  const [profissionais, setProfissionais] = useState([]);
  const [areas, setAreas] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfissional, setEditingProfissional] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    whats: '',
    id_area_atuacao: '',
    ativo: true,
    observacoes: '',
    procedimentos: [],
    disponibilidades: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profsRes, areasRes, procsRes] = await Promise.all([
        api.get('/profissionais'),
        api.get('/areas-atuacao'),
        api.get('/procedimentos')
      ]);
      setProfissionais(profsRes.data || []);
      setAreas(areasRes.data || []);
      setProcedimentos(procsRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const toggleProcedimento = (procId) => {
    setFormData(prev => {
      const procs = prev.procedimentos || [];
      if (procs.includes(procId)) {
        return { ...prev, procedimentos: procs.filter(id => id !== procId) };
      } else {
        return { ...prev, procedimentos: [...procs, procId] };
      }
    });
  };

  const openModal = async (profissional = null) => {
    if (profissional) {
      setEditingProfissional(profissional);
      
      // Buscar procedimentos e disponibilidades do profissional
      let procs = [];
      let disps = [];
      try {
        const [procsRes, dispsRes] = await Promise.all([
          api.get(`/profissionais/${profissional.id}/procedimentos`),
          api.get(`/profissionais/${profissional.id}/disponibilidade`)
        ]);
        procs = procsRes.data;
        disps = (dispsRes.data || []).map(d => ({
          dia_semana: d.dia_semana,
          hora_inicio: d.hora_inicio?.substring(0, 5) || '',
          hora_fim: d.hora_fim?.substring(0, 5) || ''
        }));
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      }
      
      setFormData({
        nome: profissional.nome || '',
        email: profissional.email || '',
        whats: profissional.whats || '',
        id_area_atuacao: profissional.id_area_atuacao?.toString() || '',
        ativo: profissional.ativo ?? true,
        observacoes: profissional.observacoes || '',
        procedimentos: procs,
        disponibilidades: disps
      });
    } else {
      setEditingProfissional(null);
      setFormData({
        nome: '',
        email: '',
        whats: '',
        id_area_atuacao: '',
        ativo: true,
        observacoes: '',
        procedimentos: [],
        disponibilidades: []
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        nome: formData.nome,
        email: formData.email,
        whats: unformatPhone(formData.whats),
        id_area_atuacao: formData.id_area_atuacao ? parseInt(formData.id_area_atuacao) : null,
        ativo: formData.ativo,
        observacoes: formData.observacoes
      };

      let profId;
      if (editingProfissional) {
        await api.put(`/profissionais/${editingProfissional.id}`, payload);
        profId = editingProfissional.id;
        toast.success('Profissional atualizado!');
      } else {
        const response = await api.post('/profissionais', payload);
        profId = response.data.id;
        toast.success('Profissional criado!');
      }
      
      // Salvar procedimentos
      if (formData.procedimentos && formData.procedimentos.length > 0) {
        await api.post(`/profissionais/${profId}/procedimentos`, formData.procedimentos);
      }
      
      // Salvar disponibilidades
      await api.post(`/profissionais/${profId}/disponibilidade`, formData.disponibilidades || []);
      
      setModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar profissional');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar profissional?')) return;
    try {
      await api.delete(`/profissionais/${id}`);
      toast.success('Profissional deletado!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao deletar');
    }
  };

  const filteredProfissionais = profissionais.filter(prof =>
    prof.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Profissionais
          </h1>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>Gerencie sua equipe</p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button data-testid="novo-profissional-button" onClick={() => openModal()} className="rounded-full px-6 py-6 text-white" style={{ backgroundColor: '#2C7464' }}>
              <Plus className="w-5 h-5 mr-2" />Novo Profissional
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProfissional ? 'Editar' : 'Novo'} Profissional</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  data-testid="input-nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Nome"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    data-testid="input-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input
                    data-testid="input-whatsapp"
                    value={formatPhone(formData.whats)}
                    onChange={(e) => setFormData({ ...formData, whats: e.target.value })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
              </div>
              
              <div>
                <Label>Área de Atuação</Label>
                <Select
                  value={formData.id_area_atuacao}
                  onValueChange={(value) => setFormData({ ...formData, id_area_atuacao: value })}
                >
                  <SelectTrigger data-testid="select-area">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas
                      .filter((area, index, self) => 
                        index === self.findIndex(a => a.nome === area.nome)
                      )
                      .map((area) => (
                        <SelectItem key={area.id} value={area.id.toString()}>
                          {area.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  data-testid="switch-ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                />
                <Label>Ativo</Label>
              </div>
              
              <div>
                <Label>Procedimentos que realiza</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto" style={{ borderColor: '#2C7464' }}>
                  {procedimentos.map((proc) => (
                    <label key={proc.id} className="flex items-center space-x-2 py-2 cursor-pointer hover:bg-gray-50 px-2 rounded">
                      <input
                        type="checkbox"
                        checked={(formData.procedimentos || []).includes(proc.id)}
                        onChange={() => toggleProcedimento(proc.id)}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: '#2C7464' }}
                      />
                      <span className="text-sm" style={{ color: '#292726' }}>
                        {proc.nome} ({proc.duracao_minutos}min)
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  data-testid="input-observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: '#2C7464' }} />
                    Horários de Trabalho
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData({
                      ...formData,
                      disponibilidades: [...(formData.disponibilidades || []), { dia_semana: 1, hora_inicio: '08:00', hora_fim: '18:00' }]
                    })}
                    className="text-xs"
                    style={{ borderColor: '#2C7464', color: '#2C7464' }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2" style={{ borderColor: '#2C7464' }}>
                  {(!formData.disponibilidades || formData.disponibilidades.length === 0) ? (
                    <p className="text-sm text-gray-500 text-center py-2">Nenhum horário cadastrado</p>
                  ) : (
                    formData.disponibilidades.map((disp, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <select
                          value={disp.dia_semana}
                          onChange={(e) => {
                            const newDisps = [...formData.disponibilidades];
                            newDisps[index].dia_semana = parseInt(e.target.value);
                            setFormData({ ...formData, disponibilidades: newDisps });
                          }}
                          className="flex-1 text-sm border rounded px-2 py-1"
                          style={{ borderColor: '#ccc' }}
                        >
                          {DIAS_SEMANA.map(dia => (
                            <option key={dia.value} value={dia.value}>{dia.label}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={disp.hora_inicio}
                          onChange={(e) => {
                            const newDisps = [...formData.disponibilidades];
                            newDisps[index].hora_inicio = e.target.value;
                            setFormData({ ...formData, disponibilidades: newDisps });
                          }}
                          className="text-sm border rounded px-2 py-1 w-24"
                          style={{ borderColor: '#ccc' }}
                        />
                        <span className="text-sm text-gray-500">até</span>
                        <input
                          type="time"
                          value={disp.hora_fim}
                          onChange={(e) => {
                            const newDisps = [...formData.disponibilidades];
                            newDisps[index].hora_fim = e.target.value;
                            setFormData({ ...formData, disponibilidades: newDisps });
                          }}
                          className="text-sm border rounded px-2 py-1 w-24"
                          style={{ borderColor: '#ccc' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newDisps = formData.disponibilidades.filter((_, i) => i !== index);
                            setFormData({ ...formData, disponibilidades: newDisps });
                          }}
                          className="p-1 rounded hover:bg-gray-200"
                        >
                          <X className="w-4 h-4" style={{ color: '#FEA5A4' }} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  data-testid="submit-profissional"
                  style={{ backgroundColor: '#2C7464', color: 'white' }}
                >
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#2C7464' }} />
        <Input
          data-testid="search-profissionais"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar..."
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfissionais.map((prof) => (
            <Card
              key={prof.id}
              data-testid={`profissional-card-${prof.id}`}
              className="p-6 rounded-2xl shadow-lg"
              style={{ backgroundColor: 'white' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold" style={{ color: '#2C7464' }}>
                    {prof.nome}
                  </h3>
                  {prof.area_atuacao && (
                    <p className="text-sm mt-1" style={{ color: '#292726' }}>
                      {prof.area_atuacao.nome}
                    </p>
                  )}
                  <span
                    className="inline-block px-3 py-1 text-xs font-medium rounded-full mt-2"
                    style={{
                      backgroundColor: prof.ativo ? '#2C7464' : '#ccc',
                      color: 'white'
                    }}
                  >
                    {prof.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openModal(prof)}
                    data-testid={`edit-profissional-${prof.id}`}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <Edit className="w-4 h-4" style={{ color: '#2C7464' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(prof.id)}
                    data-testid={`delete-profissional-${prof.id}`}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <Trash2 className="w-4 h-4" style={{ color: '#FEA5A4' }} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {prof.email && (
                  <p className="text-sm" style={{ color: '#292726' }}>
                    <span className="font-medium">Email:</span> {prof.email}
                  </p>
                )}
                {prof.whats && (
                  <p className="text-sm" style={{ color: '#292726' }}>
                    <span className="font-medium">WhatsApp:</span> {formatPhone(prof.whats)}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredProfissionais.length === 0 && (
        <p className="text-center py-12" style={{ color: '#292726' }}>
          Nenhum profissional encontrado
        </p>
      )}
    </div>
  );
};

export default Profissionais;