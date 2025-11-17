import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Clock, DollarSign } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

const Servicos = () => {
  const [procedimentos, setProcedimentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProcedimento, setEditingProcedimento] = useState(null);
  const [formData, setFormData] = useState({ nome: '', descricao: '', duracao_minutos: '', valor: '', categoria: '', orientacoes: '' });

  useEffect(() => { fetchProcedimentos(); }, []);

  const fetchProcedimentos = async () => {
    try {
      const response = await api.get('/procedimentos');
      setProcedimentos(response.data || []);
    } catch (error) {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (procedimento = null) => {
    if (procedimento) {
      setEditingProcedimento(procedimento);
      setFormData({ nome: procedimento.nome || '', descricao: procedimento.descricao || '', duracao_minutos: procedimento.duracao_minutos?.toString() || '', valor: procedimento.valor?.toString() || '', categoria: procedimento.categoria || '', orientacoes: procedimento.orientacoes || '' });
    } else {
      setEditingProcedimento(null);
      setFormData({ nome: '', descricao: '', duracao_minutos: '', valor: '', categoria: '', orientacoes: '' });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, duracao_minutos: parseInt(formData.duracao_minutos), valor: parseFloat(formData.valor) };
      if (editingProcedimento) {
        await api.put(`/procedimentos/${editingProcedimento.id}`, payload);
        toast.success('Atualizado!');
      } else {
        await api.post('/procedimentos', payload);
        toast.success('Criado!');
      }
      setModalOpen(false);
      fetchProcedimentos();
    } catch (error) {
      toast.error('Erro ao salvar');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar?')) return;
    try {
      await api.delete(`/procedimentos/${id}`);
      toast.success('Deletado!');
      fetchProcedimentos();
    } catch (error) {
      toast.error('Erro');
    }
  };

  const filteredProcedimentos = procedimentos.filter(proc => proc.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>Serviços</h1>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>Gerencie os serviços</p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="novo-servico-button"
              onClick={() => openModal()}
              className="rounded-full px-6 py-6 text-white"
              style={{ backgroundColor: '#2C7464' }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Novo Serviço
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingProcedimento ? 'Editar' : 'Novo'} Serviço</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Nome *</Label><Input data-testid="input-nome" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required placeholder="Limpeza de Pele" /></div>
              <div><Label>Descrição</Label><Textarea data-testid="input-descricao" value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Duração (min) *</Label><Input data-testid="input-duracao" type="number" value={formData.duracao_minutos} onChange={(e) => setFormData({ ...formData, duracao_minutos: e.target.value })} required placeholder="60" /></div>
                <div><Label>Valor (R$) *</Label><Input data-testid="input-valor" type="number" step="0.01" value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: e.target.value })} required placeholder="150" /></div>
                <div><Label>Categoria</Label><Input data-testid="input-categoria" value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} placeholder="Estética" /></div>
              </div>
              <div><Label>Orientações</Label><Textarea data-testid="input-orientacoes" value={formData.orientacoes} onChange={(e) => setFormData({ ...formData, orientacoes: e.target.value })} /></div>
              <div className="flex justify-end space-x-3"><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" data-testid="submit-servico" style={{ backgroundColor: '#2C7464', color: 'white' }}>Salvar</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#2C7464' }} /><Input data-testid="search-servicos" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-10" /></div>
      {loading ? (<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} /></div></div>) : (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredProcedimentos.map((proc) => (<Card key={proc.id} data-testid={`servico-card-${proc.id}`} className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}><div className="flex items-start justify-between mb-4"><div className="flex-1"><h3 className="text-lg font-bold" style={{ color: '#2C7464' }}>{proc.nome}</h3>{proc.categoria && (<span className="inline-block px-3 py-1 text-xs font-medium rounded-full mt-2" style={{ backgroundColor: '#FEA5A4', color: 'white' }}>{proc.categoria}</span>)}</div><div className="flex space-x-2"><button onClick={() => openModal(proc)} data-testid={`edit-servico-${proc.id}`} className="p-2 rounded-lg hover:bg-gray-100"><Edit className="w-4 h-4" style={{ color: '#2C7464' }} /></button><button onClick={() => handleDelete(proc.id)} data-testid={`delete-servico-${proc.id}`} className="p-2 rounded-lg hover:bg-gray-100"><Trash2 className="w-4 h-4" style={{ color: '#FEA5A4' }} /></button></div></div>{proc.descricao && (<p className="text-sm mb-4" style={{ color: '#292726' }}>{proc.descricao}</p>)}<div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#F7F1EB' }}><div className="flex items-center text-sm" style={{ color: '#292726' }}><Clock className="w-4 h-4 mr-1" style={{ color: '#2C7464' }} />{proc.duracao_minutos} min</div><div className="flex items-center text-lg font-bold" style={{ color: '#2C7464' }}><DollarSign className="w-5 h-5" />{ proc.valor?.toFixed(2)}</div></div></Card>))}</div>)}
      {!loading && filteredProcedimentos.length === 0 && (<p className="text-center py-12" style={{ color: '#292726' }}>Nenhum serviço encontrado</p>)}
    </div>
  );
};

export default Servicos;