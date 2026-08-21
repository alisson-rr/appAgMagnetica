import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Phone, Mail, Users } from 'lucide-react';
import { formatPhone, unformatPhone } from '../utils/formatters';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';

const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [filteredClientes, setFilteredClientes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
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
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        data_nascimento: cliente.data_nascimento || '',
        interesses: cliente.interesses || '',
        status: cliente.status || 'ativo'
      });
    } else {
      setEditingCliente(null);
      setFormData({
        nome: '',
        telefone: '',
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
      // Converter strings vazias para null
      const dataToSend = {
        ...formData,
        telefone: unformatPhone(formData.telefone) || null,
        email: formData.email || null,
        data_nascimento: formData.data_nascimento || null,
        interesses: formData.interesses || null
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
    <div className="page-shell">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <PageHeader title="Clientes" description="Quem você atende, com contato e histórico de interesses.">
          <DialogTrigger asChild>
            <Button data-testid="novo-cliente-button" onClick={() => openModal()} size="lg">
              <Plus className="w-5 h-5" />
              Novo cliente
            </Button>
          </DialogTrigger>
        </PageHeader>
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
                  <Label>Telefone</Label>
                  <Input
                    data-testid="input-telefone"
                    value={formatPhone(formData.telefone)}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
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
                <Button type="submit" data-testid="submit-cliente">
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary" />
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
        <Loading />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClientes.map((cliente) => (
            <Card
              key={cliente.id}
              data-testid={`cliente-card-${cliente.id}`}
              className="p-6 transition hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {cliente.nome}
                  </h3>
                  <span className={`badge mt-2 ${cliente.status === 'ativo' ? 'badge-success' : 'badge-neutral'}`}>
                    {cliente.status}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openModal(cliente)}
                    data-testid={`edit-cliente-${cliente.id}`}
                    className="icon-action"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cliente.id)}
                    data-testid={`delete-cliente-${cliente.id}`}
                    className="icon-action"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {cliente.telefone && (
                  <div className="flex items-center text-sm text-foreground">
                    <Phone className="w-4 h-4 mr-2 text-primary" />
                    {formatPhone(cliente.telefone)}
                  </div>
                )}
                {cliente.email && (
                  <div className="flex items-center text-sm text-foreground">
                    <Mail className="w-4 h-4 mr-2 text-primary" />
                    {cliente.email}
                  </div>
                )}
              </div>

              {cliente.interesses && (
                <p className="mt-4 text-sm text-foreground">
                  <span className="font-medium">Interesses:</span> {cliente.interesses}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredClientes.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title={searchTerm ? 'Nenhum cliente com esse nome' : 'Nenhum cliente cadastrado'}
            description={
              searchTerm
                ? 'Tente outro termo de busca.'
                : 'Cadastre quem você atende para que a agenda reconheça a pessoa na conversa.'
            }
          />
        </Card>
      )}
    </div>
  );
};

export default Clientes;