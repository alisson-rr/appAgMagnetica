import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { formatPhone, unformatPhone } from '../utils/formatters';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';

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
    procedimentos: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profsRes, areasRes] = await Promise.all([
        api.get('/profissionais'),
        api.get('/areas-atuacao')
      ]);
      setProfissionais(profsRes.data || []);
      setAreas(areasRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (profissional = null) => {
    if (profissional) {
      setEditingProfissional(profissional);
      setFormData({
        nome: profissional.nome || '',
        email: profissional.email || '',
        whats: profissional.whats || '',
        id_area_atuacao: profissional.id_area_atuacao?.toString() || '',
        ativo: profissional.ativo ?? true,
        observacoes: profissional.observacoes || ''
      });
    } else {
      setEditingProfissional(null);
      setFormData({
        nome: '',
        email: '',
        whats: '',
        id_area_atuacao: '',
        ativo: true,
        observacoes: ''
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        id_area_atuacao: formData.id_area_atuacao ? parseInt(formData.id_area_atuacao) : null,
        whats: unformatPhone(formData.whats)
      };

      if (editingProfissional) {
        await api.put(`/profissionais/${editingProfissional.id}`, payload);
        toast.success('Profissional atualizado!');
      } else {
        await api.post('/profissionais', payload);
        toast.success('Profissional criado!');
      }
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
                    {areas.map((area) => (
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
                <Label>Observações</Label>
                <Textarea
                  data-testid="input-observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
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