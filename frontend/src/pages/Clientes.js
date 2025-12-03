import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Phone, Mail } from 'lucide-react';
import { formatPhone, unformatPhone } from '../utils/formatters';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [filteredClientes, setFilteredClientes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    whats: '',
    email: '',
    data_nascimento: '',
    interesses: '',
    status: 'ativo'
  });

  useEffect(() => {
    fetchClientes();
  }, []);

  useEffect(() => {
    const filtered = clientes.filter(cliente =>
      cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cliente.email && cliente.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredClientes(filtered);
  }, [searchTerm, clientes]);

  const fetchClientes = async () => {
    try {
      const response = await api.get('/clientes');
      setClientes(response.data || []);
      setFilteredClientes(response.data || []);
    } catch (error) {
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (cliente = null) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData({
        nome: cliente.nome || '',
        whats: cliente.whats || '',
        email: cliente.email || '',
        data_nascimento: cliente.data_nascimento || '',
        interesses: cliente.interesses || '',
        status: cliente.status || 'ativo'
      });
    } else {
      setEditingCliente(null);
      setFormData({
        nome: '',
        whats: '',
        email: '',
        data_nascimento: '',
        interesses: '',
        status: 'ativo'
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Remover formatação do WhatsApp antes de enviar
      const dataToSend = {
        ...formData,
        whats: unformatPhone(formData.whats)
      };
      
      if (editingCliente) {
        await api.put(`/clientes/${editingCliente.id}`, dataToSend);
        toast.success('Cliente atualizado com sucesso!');
      } else {
        await api.post('/clientes', dataToSend);
        toast.success('Cliente criado com sucesso!');
      }
      
      setModalOpen(false);
      fetchClientes();
    } catch (error) {
      toast.error('Erro ao salvar cliente');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja deletar este cliente?')) return;
    
    try {
      await api.delete(`/clientes/${id}`);
      toast.success('Cliente deletado com sucesso!');
      fetchClientes();
    } catch (error) {
      toast.error('Erro ao deletar cliente');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Clientes
          </h1>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>
            Gerencie seus clientes
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="novo-cliente-button"
              onClick={() => openModal()}
              className="rounded-full px-6 py-6 text-white"
              style={{ backgroundColor: '#2C7464' }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCliente ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  data-testid="input-nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Nome completo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>WhatsApp</Label>
                  <Input
                    data-testid="input-whatsapp"
                    value={formData.whats}
                    onChange={(e) => setFormData({ ...formData, whats: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    data-testid="input-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input
                    data-testid="input-data-nascimento"
                    type="date"
                    value={formData.data_nascimento}
                    onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  />
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
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Interesses</Label>
                <Textarea
                  data-testid="input-interesses"
                  value={formData.interesses}
                  onChange={(e) => setFormData({ ...formData, interesses: e.target.value })}
                  placeholder="Procedimentos de interesse..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  data-testid="submit-cliente"
                  style={{ backgroundColor: '#2C7464', color: 'white' }}
                >
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#2C7464' }} />
          <Input
            data-testid="search-clientes"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar clientes..."
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClientes.map((cliente) => (
            <Card
              key={cliente.id}
              data-testid={`cliente-card-${cliente.id}`}
              className="p-6 rounded-2xl shadow-lg"
              style={{ backgroundColor: 'white' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold" style={{ color: '#2C7464' }}>
                    {cliente.nome}
                  </h3>
                  <span
                    className="inline-block px-3 py-1 text-xs font-medium rounded-full mt-2"
                    style={{
                      backgroundColor: cliente.status === 'ativo' ? '#2C7464' : '#ccc',
                      color: 'white'
                    }}
                  >
                    {cliente.status}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openModal(cliente)}
                    data-testid={`edit-cliente-${cliente.id}`}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <Edit className="w-4 h-4" style={{ color: '#2C7464' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(cliente.id)}
                    data-testid={`delete-cliente-${cliente.id}`}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <Trash2 className="w-4 h-4" style={{ color: '#FEA5A4' }} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {cliente.whats && (
                  <div className="flex items-center text-sm" style={{ color: '#292726' }}>
                    <Phone className="w-4 h-4 mr-2" style={{ color: '#2C7464' }} />
                    {cliente.whats}
                  </div>
                )}
                {cliente.email && (
                  <div className="flex items-center text-sm" style={{ color: '#292726' }}>
                    <Mail className="w-4 h-4 mr-2" style={{ color: '#2C7464' }} />
                    {cliente.email}
                  </div>
                )}
              </div>

              {cliente.interesses && (
                <p className="mt-4 text-sm" style={{ color: '#292726' }}>
                  <span className="font-medium">Interesses:</span> {cliente.interesses}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredClientes.length === 0 && (
        <p className="text-center py-12" style={{ color: '#292726' }}>
          Nenhum cliente encontrado
        </p>
      )}
    </div>
  );
};

export default Clientes;