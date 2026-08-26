import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Clock } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';
import ServicoForm from '../components/ServicoForm';

const Servicos = () => {
  const [procedimentos, setProcedimentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);

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
    setEditando(procedimento);
    setModalOpen(true);
  };

  const salvar = async (payload) => {
    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/procedimentos/${editando.id}`, payload);
        toast.success('Atualizado!');
      } else {
        await api.post('/procedimentos', payload);
        toast.success('Criado!');
      }
      setModalOpen(false);
      fetchProcedimentos();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar');
      return false;
    } finally {
      setSalvando(false);
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
    <div className="page-shell">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <PageHeader
          title="Procedimento"
          description="Duração e valor de cada serviço definem como a agenda é oferecida."
        >
          <DialogTrigger asChild>
            <Button data-testid="novo-servico-button" onClick={() => openModal()} size="lg">
              <Plus className="w-5 h-5" />
              Novo procedimento
            </Button>
          </DialogTrigger>
        </PageHeader>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Novo'} Procedimento</DialogTitle>
          </DialogHeader>
          {/* `key` remonta o formulário ao trocar de item: sem isso o modal
              reabriria com os valores do procedimento anterior. */}
          <ServicoForm
            key={editando?.id ?? 'novo'}
            valoresIniciais={
              editando
                ? {
                    nome: editando.nome || '',
                    descricao: editando.descricao || '',
                    duracao_minutos: editando.duracao_minutos?.toString() || '',
                    valor: editando.valor?.toString() || '',
                    orientacoes: editando.orientacoes || '',
                  }
                : null
            }
            enviando={salvando}
            aoSalvar={salvar}
            aoCancelar={() => setModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary" />
        <label htmlFor="busca-servicos" className="sr-only">Buscar procedimento</label>
        <Input
          id="busca-servicos"
          data-testid="search-servicos"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar..."
          className="pl-10"
        />
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProcedimentos.map((proc) => (
            <Card
              key={proc.id}
              data-testid={`servico-card-${proc.id}`}
              className="p-6 transition hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {proc.nome}
                  </h3>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openModal(proc)}
                    data-testid={`edit-servico-${proc.id}`}
                    aria-label={`Editar ${proc.nome}`}
                    className="icon-action"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(proc.id)}
                    data-testid={`delete-servico-${proc.id}`}
                    aria-label={`Excluir ${proc.nome}`}
                    className="icon-action icon-action-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {proc.descricao && (
                <p className="text-sm mb-4 text-foreground">
                  {proc.descricao}
                </p>
              )}

              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <div className="flex items-center text-sm text-foreground">
                  <Clock className="w-4 h-4 mr-1 text-primary" />
                  {proc.duracao_minutos} min
                </div>
                <div className="flex items-center text-lg font-bold text-primary">
                  R$ {Number(proc.valor ?? 0).toFixed(2)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredProcedimentos.length === 0 && (
        <Card>
          <EmptyState
            icon={Clock}
            title={searchTerm ? 'Nenhum procedimento com esse nome' : 'Nenhum procedimento cadastrado'}
            description="Duração e valor de cada procedimento definem os horários oferecidos no atendimento."
          />
        </Card>
      )}
    </div>
  );
};

export default Servicos;
